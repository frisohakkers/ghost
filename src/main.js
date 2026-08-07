import "./style.css";

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

// Matches the .wordmark transition duration in style.css — the page-2
// headline waits for that move to finish before it starts fading in.
const HEADLINE_DELAY_MS = 700;

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

// Composes viewport-fit (offsetX, viewportScale — same convention the rest
// of the layout uses) with the active page's own design-space target, all
// in one transform string with a fixed function structure (translate, scale,
// translate, scale) every time, so the CSS transition can interpolate it
// smoothly between any two pages' states instead of just snapping.
function updateWordmarkTransform() {
  if (!wordmark) return;
  const state = WORDMARK_STATES[currentPage] || WORDMARK_STATES[1];
  const scale = viewportScale();
  const offsetX = (window.innerWidth - DESIGN_W * scale) / 2;
  wordmark.style.transform = `translate(${offsetX}px, 0px) scale(${scale}) translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}

function updateHeroCenterScale() {
  const scale = viewportScale();
  heroCenters.forEach((heroCenter) => {
    heroCenter.style.transform = `translate(-50%, -50%) scale(${scale})`;
  });
}

function updateLayoutScale() {
  updateWordmarkTransform();
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
  updateWordmarkTransform();

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
// guarantee). Removes the veil itself once the sweep completes.
function runLoadingVeil() {
  if (!loadingVeil) return;
  const DELAY = 200;
  const DURATION = 2200;

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
      loadingVeil.remove();
    }
  }

  requestAnimationFrame((t) => tick(t, t));
  // Hard backstop in case a backgrounded/throttled tab stalls the rAF loop
  // partway through — never leave the veil stuck covering the page.
  window.setTimeout(() => loadingVeil.remove(), 4000);
}

window.addEventListener("resize", updateLayoutScale);
updateLayoutScale();
setPage(1);
runLoadingVeil();

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
