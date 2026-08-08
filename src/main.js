import "./style.css";
import { animate, motionValue } from "motion";

const DESIGN_W = 1440;
const DESIGN_H = 900;
const WORDMARK_NATIVE_W = 1105.224;

// Shared wordmark's target state per page, in DESIGN_W/DESIGN_H coordinate
// space: (x, y) is the top-left of its raw 1105.224x400 artwork, `scale` is
// applied on top of that. Pages 2 and 3 share the same 0.08 scale/centering
// (matches the Figma spec for both) and differ only in y.
const WORDMARK_STATES = {
  1: { x: 167, y: 259, scale: 1 },
  2: { x: centeredWordmarkX(0.08), y: 363, scale: 0.08 },
  3: { x: centeredWordmarkX(0.08), y: 79, scale: 0.08 },
};

// Roughly matches how long the wordmark spring takes to settle — the page-2
// headline waits for that move before it starts fading in.
const HEADLINE_DELAY_MS = 750;

const pages = Array.from(document.querySelectorAll(".page"));
const heroCenters = Array.from(document.querySelectorAll(".hero-center"));
const documentScroll = document.querySelector(".document-scroll");
const footerOuter = document.querySelector(".page-footer-outer");
const footerShell = document.querySelector(".page-footer-shell");
const loadingVeil = document.getElementById("loading-veil");
const wordmark = document.getElementById("wordmark");
const page2Headline = document.getElementById("page2-headline");

const FOOTER_CONTENT_H = 849;

let currentPage = 1;
let headlineTimer = null;

function centeredWordmarkX(scale) {
  return (DESIGN_W - WORDMARK_NATIVE_W * scale) / 2;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function viewportScale() {
  return Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
}

function footerScale() {
  return Math.min(window.innerWidth / DESIGN_W, 1);
}

function footerLayoutHeight() {
  const viewportH = documentScroll?.clientHeight ?? window.innerHeight;
  return viewportH / footerScale();
}

function updateFooterScale() {
  if (!footerOuter || !footerShell) return;

  const scale = footerScale();
  const layoutH = footerLayoutHeight();
  const footer = footerShell.querySelector(".page-footer");

  footerShell.style.width = `${DESIGN_W}px`;
  footerShell.style.height = `${layoutH}px`;
  footerShell.style.transform = `scale(${scale})`;

  footerOuter.style.width = `${DESIGN_W * scale}px`;
  footerOuter.style.height = `${layoutH * scale}px`;

  if (footer) {
    footer.style.height = `${layoutH}px`;
  }
}

// ---- Framer Motion springs ----
// All the page-to-page motion is driven by Motion (Framer Motion's engine)
// spring/tween animations on MotionValues, so transitions feel physical and
// smooth and — crucially — interrupt gracefully: scrolling back mid-transition
// re-targets the same MotionValue and it eases from wherever it currently is,
// no snapping.
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

// The wordmark's page moves: a soft, well-damped spring. The paper rises on a
// gentler spring (it travels a full viewport height) and leaves on a quick
// tween timed to page 3's own fade so it doesn't linger after the page is gone.
const WORDMARK_SPRING = { type: "spring", stiffness: 130, damping: 24, mass: 1 };
const PAPER_RISE_SPRING = { type: "spring", stiffness: 90, damping: 21, mass: 1 };
const PAPER_EXIT_TWEEN = { type: "tween", duration: 0.4, ease: [0.4, 0, 1, 1] };

// The wordmark target lives in DESIGN-space (x, y, scale); the viewport-fit
// part (offsetX, viewportScale) is composed live every frame so a resize
// mid-animation stays correct. The paper value is a translateY percentage
// (100 = parked below the viewport, 0 = fully risen).
const mwX = motionValue(WORDMARK_STATES[1].x);
const mwY = motionValue(WORDMARK_STATES[1].y);
const mwScale = motionValue(WORDMARK_STATES[1].scale);
const mPaper = motionValue(100);

function renderWordmark() {
  if (!wordmark) return;
  const scale = viewportScale();
  const offsetX = (window.innerWidth - DESIGN_W * scale) / 2;
  wordmark.style.transform =
    `translate(${offsetX}px, 0px) scale(${scale}) ` +
    `translate(${mwX.get()}px, ${mwY.get()}px) scale(${mwScale.get()})`;
}

function renderPaper() {
  if (!documentScroll) return;
  documentScroll.style.transform = `translateY(${mPaper.get()}%)`;
}

mwX.on("change", renderWordmark);
mwY.on("change", renderWordmark);
mwScale.on("change", renderWordmark);
mPaper.on("change", renderPaper);

// Animate a MotionValue to a target, or jump instantly under reduced motion.
function move(value, target, options) {
  if (prefersReducedMotion) {
    value.set(target);
    return;
  }
  animate(value, target, options);
}

function animateWordmark(page) {
  const state = WORDMARK_STATES[page] || WORDMARK_STATES[1];
  move(mwX, state.x, WORDMARK_SPRING);
  move(mwY, state.y, WORDMARK_SPRING);
  move(mwScale, state.scale, WORDMARK_SPRING);
}

function animatePaper(page) {
  if (page === 3) {
    move(mPaper, 0, PAPER_RISE_SPRING);
  } else {
    move(mPaper, 100, PAPER_EXIT_TWEEN);
  }
}

function updateHeroCenterScale() {
  const scale = viewportScale();
  heroCenters.forEach((heroCenter) => {
    heroCenter.style.transform = `translate(-50%, -50%) scale(${scale})`;
  });
}

function updateLayoutScale() {
  renderWordmark();
  updateHeroCenterScale();
  updateFooterScale();
}

function setPage(pageNumber) {
  currentPage = pageNumber;

  pages.forEach((page) => {
    const isActive = Number(page.dataset.page) === pageNumber;
    page.classList.toggle("is-active", isActive);
    page.setAttribute("aria-hidden", isActive ? "false" : "true");
  });

  document.body.dataset.page = String(pageNumber);
  animateWordmark(pageNumber);
  animatePaper(pageNumber);

  if (pageNumber === 3) {
    documentScroll?.scrollTo(0, 0);
    updateFooterScale();
  }

  if (headlineTimer) {
    window.clearTimeout(headlineTimer);
    headlineTimer = null;
  }

  if (pageNumber === 2) {
    // Reset first (in case this page was already visited once this session)
    // so the fade-up replays every time, then wait out the wordmark's own
    // move before starting it.
    page2Headline?.classList.remove("headline-in");
    headlineTimer = window.setTimeout(() => {
      page2Headline?.classList.add("headline-in");
      headlineTimer = null;
    }, HEADLINE_DELAY_MS);
  } else {
    page2Headline?.classList.remove("headline-in");
  }
}

function handleContinue(event) {
  const key = event.currentTarget;
  key?.classList.add("pressed");

  window.setTimeout(() => {
    key?.classList.remove("pressed");

    if (currentPage < pages.length) {
      setPage(currentPage + 1);
    }
  }, 120);
}

// Drives the loading veil's mask-position by hand, writing the identical
// value to both the prefixed and unprefixed properties from one piece of
// state every frame (see the comment on #loading-veil in style.css for why
// that matters — it's what the earlier CSS-@keyframes version couldn't
// guarantee). Removes the veil itself once the sweep completes, then runs
// onComplete exactly once (guarded so the rAF end and the stall backstop
// can't fire it twice).
function runLoadingVeil(onComplete) {
  if (!loadingVeil) {
    onComplete?.();
    return;
  }
  const DELAY = 200;
  const DURATION = 2200;

  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    loadingVeil.remove();
    onComplete?.();
  }

  function tick(now, start) {
    const elapsed = now - start;
    if (elapsed < DELAY) {
      requestAnimationFrame((t) => tick(t, start));
      return;
    }
    const t = Math.min((elapsed - DELAY) / DURATION, 1);
    const pos = `0% ${(easeInOutCubic(t) * 100).toFixed(3)}%`;
    loadingVeil.style.setProperty("mask-position", pos);
    loadingVeil.style.setProperty("-webkit-mask-position", pos);
    if (t < 1) {
      requestAnimationFrame((next) => tick(next, start));
    } else {
      finish();
    }
  }

  requestAnimationFrame((t) => tick(t, t));
  // Hard backstop in case a backgrounded/throttled tab stalls the rAF loop
  // partway through — never leave the veil stuck covering the page.
  window.setTimeout(finish, 4000);
}

// ---- hero typewriter ----
// On first hero load, the page-1 nav's non-active links (things, team) and
// the page-1 tagline both "type" in one character at a time. prepHeroType()
// stashes each element's real text and blanks it immediately (before the veil
// finishes lifting) so the text is never briefly shown in full; runHeroType()
// then types it back in once the veil completes. Reduced-motion users skip
// straight to the full text (prefersReducedMotion is declared up with the
// spring config).

function heroTypeTargets() {
  const page1 = document.querySelector(".page-1");
  if (!page1) return [];
  return [
    ...page1.querySelectorAll(".nav-link:not(.active)"),
    ...page1.querySelectorAll(".tagline p"),
  ];
}

function prepHeroType() {
  if (prefersReducedMotion) return;
  heroTypeTargets().forEach((el) => {
    el.dataset.typeText = el.textContent;
    el.textContent = "";
  });
}

// Types `text` into `el` one char at a time at ~20 chars/sec, showing a
// blinking caret (via the .typing class) until it's done. Resolves when the
// full string is in place. Sequential awaits chain characters within a line;
// separate async chains let the left nav and right tagline type in parallel.
function typeInto(el, text, cps = 20) {
  return new Promise((resolve) => {
    const interval = 1000 / cps;
    el.classList.add("typing");
    let i = 0;
    function step() {
      i += 1;
      el.textContent = text.slice(0, i);
      if (i < text.length) {
        window.setTimeout(step, interval);
      } else {
        el.classList.remove("typing");
        resolve();
      }
    }
    if (text.length === 0) {
      el.classList.remove("typing");
      resolve();
      return;
    }
    window.setTimeout(step, interval);
  });
}

function runHeroType() {
  if (prefersReducedMotion) return;
  const page1 = document.querySelector(".page-1");
  if (!page1) return;

  const typeSequence = async (els) => {
    for (const el of els) {
      await typeInto(el, el.dataset.typeText ?? "");
    }
  };

  // Left nav and right tagline type concurrently; within each, lines type in
  // order (things → team, "the personal" → "ai computer").
  typeSequence([...page1.querySelectorAll(".nav-link:not(.active)")]);
  typeSequence([...page1.querySelectorAll(".tagline p")]);
}

window.addEventListener("resize", updateLayoutScale);
updateLayoutScale();
setPage(1);
prepHeroType();
runLoadingVeil(runHeroType);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;

  const activePage = document.querySelector(".page.is-active");
  if (!activePage) return;

  const returnKey = activePage.querySelector(".return-key");
  if (!returnKey) return;

  event.preventDefault();
  handleContinue({ currentTarget: returnKey });
});

document.querySelectorAll(".return-key").forEach((key) => {
  key.addEventListener("click", handleContinue);
});

document.querySelectorAll('[data-action="home"]').forEach((el) => {
  el.addEventListener("click", (event) => {
    event.preventDefault();
    setPage(1);
  });
});

// ---- scroll / wheel navigation ----
// Lets the wheel move between the three states as well as the Return key, so a
// visitor can scroll back to the previous state, not just forward. On pages 1
// and 2 (which have no content of their own to scroll) the wheel simply steps
// the page; on page 3 the manifesto scrolls natively, and only once it's
// pinned at the very top does a further scroll-up hand control back to page 2.
//
// Each step opens a short dwell window (≈ the spring's settle time) during
// which wheel input is swallowed, so the state is actually seen. The hard part
// is what happens once that window ends while the wheel is STILL firing:
//   - A single hard flick is one burst of momentum that decays over time, so by
//     the end of the dwell its delta has dropped well below the gesture's peak.
//     We treat that residual tail as the SAME gesture and don't step again —
//     one flick = one step, so it can't skip past a state.
//   - A sustained scroll (or a fresh push) comes back near the peak delta; that
//     reads as new intent and advances. So holding a scroll keeps stepping.
// A brief quiet gap resets the gesture, so after you stop, the next scroll — of
// any strength — always advances.
const LAST_PAGE = pages.length;
const NAV_DWELL_MS = 750;
const NEW_PUSH_RATIO = 0.5; // a post-dwell delta this fraction of the gesture's
const NEW_PUSH_FLOOR = 12; //   peak (and above this floor) counts as fresh intent
const GESTURE_RESET_MS = 200;

let navDwellUntil = 0;
let gesturePeak = 0;
let awaitingNewGesture = false;
let gestureResetTimer = null;

function atDocTop() {
  return !documentScroll || documentScroll.scrollTop <= 0;
}

// Decides whether a wheel event represents fresh navigation intent, folding a
// decaying flick's tail into the gesture that already stepped.
function wheelWantsStep(event) {
  const abs = Math.abs(event.deltaY);

  if (gestureResetTimer) window.clearTimeout(gestureResetTimer);
  gestureResetTimer = window.setTimeout(() => {
    awaitingNewGesture = false;
    gesturePeak = 0;
  }, GESTURE_RESET_MS);

  // Still dwelling on the state we just moved to: ignore input, but keep the
  // running peak so we can size up the tail once the dwell ends.
  if (event.timeStamp < navDwellUntil) {
    gesturePeak = Math.max(gesturePeak, abs);
    return false;
  }

  if (awaitingNewGesture) {
    const isFreshPush = abs >= gesturePeak * NEW_PUSH_RATIO && abs >= NEW_PUSH_FLOOR;
    if (!isFreshPush) {
      gesturePeak = Math.max(gesturePeak, abs); // same flick, still decaying
      return false;
    }
    gesturePeak = abs; // a new gesture begins
  } else {
    gesturePeak = abs;
  }
  return true;
}

function stepPage(target, event) {
  if (target < 1 || target > LAST_PAGE || target === currentPage) return;
  navDwellUntil = event.timeStamp + NAV_DWELL_MS;
  awaitingNewGesture = true;
  setPage(target);
}

window.addEventListener(
  "wheel",
  (event) => {
    const dir = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
    if (dir === 0) return;

    // On page 3 the manifesto scrolls natively; only an upward scroll pinned at
    // the very top is navigation back to the previous state.
    if (currentPage === LAST_PAGE && !(dir < 0 && atDocTop())) return;

    event.preventDefault();
    if (!wheelWantsStep(event)) return;
    stepPage(currentPage + dir, event);
  },
  { passive: false }
);
