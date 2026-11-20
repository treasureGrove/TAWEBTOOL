const menu = document.querySelector(".menu-toggle");
const nav = document.getElementById("site-nav");
const narrow = window.matchMedia("(max-width: 720px)");

if (menu && nav) {
  function closeMenu() {
    menu.setAttribute("aria-expanded", "false");
  }

  function syncMenu() {
    const focusWasInNav = nav.contains(document.activeElement);
    menu.hidden = !narrow.matches;
    closeMenu();
    if (narrow.matches && focusWasInNav) menu.focus({ preventScroll: true });
  }

  menu.addEventListener("click", () => {
    menu.setAttribute("aria-expanded", String(menu.getAttribute("aria-expanded") !== "true"));
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-site-header]")) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
      closeMenu();
      menu.focus();
    }
  });
  narrow.addEventListener("change", syncMenu);
  syncMenu();
}

const film = document.getElementById("product-film");
const chapters = [...document.querySelectorAll("[data-film-time]")];

if (film && chapters.length) {
  function markChapter() {
    const current = chapters.findLast((link) => Number(link.dataset.filmTime) <= film.currentTime);
    for (const link of chapters) {
      if (link === current) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    }
  }

  for (const link of chapters) {
    link.addEventListener("click", (event) => {
      if (event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || film.error) return;
      event.preventDefault();
      film.currentTime = Number(link.dataset.filmTime);
      film.controls = true;
      void film.play().catch(() => { film.controls = true; });
    });
  }
  film.addEventListener("timeupdate", markChapter);
  film.addEventListener("seeked", markChapter);
}

// Match the location indicator to the sections that appear in this navigation.
if (nav) {
  const anchors = [...nav.querySelectorAll('a[href^="#"]')];
  const sections = anchors.map((link) => document.getElementById(link.hash.slice(1)));
  const journal = document.getElementById("updates");
  let scheduled = false;

  function updateLocation() {
    scheduled = false;
    const marker = Math.min(window.innerHeight * .35, 220);
    let current = null;
    for (const [index, section] of sections.entries()) {
      if (section && section.getBoundingClientRect().top <= marker) current = anchors[index];
    }
    if (journal && journal.getBoundingClientRect().top <= marker) current = null;
    for (const link of anchors) {
      if (link === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }

  function scheduleLocation() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(updateLocation);
  }
  window.addEventListener("scroll", scheduleLocation, { passive: true });
  window.addEventListener("resize", scheduleLocation);
  updateLocation();
}

// Guilloché curves are drawn once at each rendered size. The rigid print can
// move independently behind the original character without redrawing each frame.
const engraving = document.querySelector(".engraving");
if (engraving) {
  function printCurves() {
    const bounds = engraving.getBoundingClientRect();
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(engraving.clientWidth * density);
    const height = Math.round(engraving.clientHeight * density);
    if (!bounds.width || !width || !height) return;
    engraving.width = width;
    engraving.height = height;
    const ctx = engraving.getContext("2d");
    if (!ctx) return;
    ctx.scale(width / 720, height / 640);
    ctx.lineWidth = 1;
    const turn = 2 * Math.PI;
    for (let line = 0; line < 62; line++) {
      const u = line / 61;
      ctx.beginPath();
      for (let n = 0; n <= 360; n++) {
        const t = n / 360 * turn;
        const phase = t + .54 * u;
        const radius = 205 + 31 * u + (46 + 12 * u) * Math.sin(3 * phase - .6);
        const x = 363 + 1.12 * radius * Math.cos(t) + (26 + 40 * u) * Math.cos(2 * t - .4);
        const y = 317 + radius * Math.sin(t) - (15 + 13 * u) * Math.sin(2 * t + .55);
        if (n === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = line % 5 === 0 ? "rgba(255,225,183,.86)" : "rgba(239,182,170,.62)";
      ctx.stroke();
    }
    ctx.lineWidth = .85;
    ctx.strokeStyle = "rgba(247,205,173,.56)";
    for (let i = 0; i < 39; i++) {
      ctx.beginPath();
      ctx.moveTo(60 + i * 3.9, 66 - i * .9);
      ctx.bezierCurveTo(122 + i * 6.7, 263 - i * 2.6, 516 - i * 3.6, 506 + i * 2.7, 604 + i * 1.8, 554 - i * 3.4);
      ctx.stroke();
    }
  }
  printCurves();
  if (window.ResizeObserver) new ResizeObserver(printCurves).observe(engraving);
  else window.addEventListener("resize", printCurves);
}
