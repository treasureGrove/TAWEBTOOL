/* Progressive enhancement: content and downloads work without this script. */
/* Start the muted film only when visible, so an offscreen visit downloads no
   video. Native controls remain available and an explicit pause is respected. */
(() => {
  const film = document.querySelector?.("#product-film");
  const play = document.querySelector?.(".film-play");
  const error = document.querySelector?.(".film-error");
  if (!film || !play) return;
  const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let inView = false;
  let userPaused = false;
  let autoplayBlocked = false;
  let internalPauses = 0;
  let pendingPlay = null;

  function showError() {
    autoplayBlocked = true;
    play.hidden = true;
    film.controls = true;
    error.hidden = false;
  }

  function pauseForVisibility() {
    pendingPlay = null;
    if (!film.paused) {
      // pause events are queued; remember each of our own pause calls so they
      // cannot be mistaken for a user pressing the native pause control.
      internalPauses += 1;
      film.pause();
    }
  }

  async function startPlayback(manual = false) {
    if (pendingPlay || !film.paused) return;
    if (manual) {
      userPaused = false;
      autoplayBlocked = false;
    }
    const request = {};
    pendingPlay = request;
    play.hidden = true;
    film.controls = true;
    error.hidden = true;
    try {
      await film.play();
    } catch (failure) {
      // Leaving the viewport can abort a still-loading play request.
      if (pendingPlay !== request || failure?.name === "AbortError") return;
      autoplayBlocked = true;
      if (failure?.name === "NotAllowedError") {
        // Low Power Mode and browser policies may require a real tap.
        play.hidden = false;
      } else {
        showError();
      }
    } finally {
      if (pendingPlay === request) pendingPlay = null;
    }
  }

  function syncPlayback() {
    if (!inView || document.hidden) {
      pauseForVisibility();
    } else if (!preference?.matches && !userPaused && !autoplayBlocked) {
      void startPlayback();
    }
  }

  film.muted = true;
  play.hidden = false;
  film.controls = false;
  play.addEventListener("click", async () => {
    await startPlayback(true);
    film.focus({ preventScroll: true });
  });
  film.addEventListener("play", () => {
    userPaused = false;
    play.hidden = true;
    film.controls = true;
    error.hidden = true;
  });
  film.addEventListener("pause", () => {
    if (internalPauses > 0) {
      internalPauses -= 1;
    } else {
      userPaused = true;
      pendingPlay = null;
    }
  });
  // A failed <source> dispatches a non-bubbling error on the source itself.
  film.addEventListener("error", showError, true);
  film.addEventListener("ended", () => {
    play.hidden = false;
    film.controls = true;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseForVisibility();
    else syncPlayback();
  });

  // Do not set the HTML autoplay attribute: it would bypass preload="none"
  // before visibility and the user's motion preference have been checked.
  if (window.IntersectionObserver) {
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting && entry.intersectionRatio >= 0.15;
      syncPlayback();
    }, { threshold: [0, 0.15] });
    observer.observe(film);
  }
  const onPreferenceChange = () => {
    if (preference.matches) {
      pauseForVisibility();
      play.hidden = false;
      film.controls = true;
    } else {
      syncPlayback();
    }
  };
  if (preference?.addEventListener) preference.addEventListener("change", onPreferenceChange);
  else preference?.addListener?.(onPreferenceChange);
})();

(() => {
  const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const targets = document.querySelectorAll(
    ".hero-copy, .hero-visual, .film-heading, .film-player, .showcase-copy, .product-frame, .section-heading, .feature, .start-heading, .start-steps li, .expand-heading, .expand-details article, .updates-heading, .release-details, .closing-section",
  );
  let reveal;
  let navigation;

  function clear() {
    reveal?.disconnect();
    navigation?.disconnect();
    targets.forEach((element) => {
      element.removeAttribute("data-motion");
      element.style.removeProperty("--entrance-delay");
    });
    document
      .querySelectorAll('.header-nav [aria-current="location"]')
      .forEach((link) => {
        link.removeAttribute("aria-current");
      });
  }

  function start() {
    clear();
    const effects = document.documentElement?.getAttribute?.("data-effects");
    if (preference?.matches || effects === "paused" || effects === "reduced" || !window.IntersectionObserver) return;
    reveal = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (!isIntersecting) return;
          target.setAttribute("data-motion", "visible");
          reveal.unobserve(target);
        });
      },
      { threshold: 0.04 },
    );
    let group = null;
    let position = 0;
    targets.forEach((element) => {
      // No above-the-fold content is hidden while the page starts up.
      if (element.getBoundingClientRect().top < window.innerHeight) return;
      if (element.parentElement !== group) {
        group = element.parentElement;
        position = 0;
      }
      element.style.setProperty(
        "--entrance-delay",
        `${Math.min(position++, 3) * 55}ms`,
      );
      element.setAttribute("data-motion", "pending");
      reveal.observe(element);
    });
    navigation = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (!isIntersecting) return;
          document
            .querySelectorAll('.header-nav a[href^="#"]')
            .forEach((link) => {
              if (link.hash === `#${target.id}`)
                link.setAttribute("aria-current", "location");
              else link.removeAttribute("aria-current");
            });
        });
      },
      { rootMargin: "-10% 0px -55% 0px", threshold: 0 },
    );
    document
      .querySelectorAll(".hero, #film, #features, #start, #updates")
      .forEach((section) => navigation.observe(section));
  }

  // Keyboard navigation must never land in an invisible pending section.
  document.addEventListener("focusin", (event) => {
    const target = event.target.closest?.('[data-motion="pending"]');
    if (target) {
      target.setAttribute("data-motion", "visible");
      reveal?.unobserve(target);
    }
  });
  if (preference?.addEventListener)
    preference.addEventListener("change", start);
  else preference?.addListener?.(start);
  document.addEventListener("lolicode:effectschange", start);
  start();
})();

/* Decorative scenes share one event-driven frame. Nothing intercepts scrolling,
   and the motion switch never changes the film's independent playback intent. */
(() => {
  const root = document.documentElement;
  if (!root?.setAttribute) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)");
  const toggle = document.querySelector?.("[data-motion-toggle]");
  const label = toggle?.querySelector("[data-motion-label]");
  const stage = document.querySelector?.("[data-parallax]");
  const hero = document.querySelector?.(".hero-visual");
  const wordmark = document.querySelector?.(".footer-wordmark");
  const progress = document.querySelector?.(".reading-progress");
  const scenes = [...(document.querySelectorAll?.(
    ".companion-stage, .studio-ribbon, .feature, .closing-section",
  ) || [])];
  const features = [...(document.querySelectorAll?.(".feature") || [])];
  const magnetic = [...(document.querySelectorAll?.("[data-magnetic]") || [])];
  const visible = new Set();
  const pointerUpdates = new Map();
  const pointerResets = [];
  let paused = false;
  let frame = 0;
  let scrollDirty = false;
  const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
  const active = () => root.getAttribute("data-effects") === "active" && !document.hidden;

  function updateScroll() {
    const height = document.documentElement.scrollHeight - window.innerHeight;
    progress?.style.setProperty(
      "--reading-progress",
      height > 0 ? clamp(window.scrollY / height) : 0,
    );
    // The observer keeps distant scenes out of layout reads.
    if (hero && visible.has(hero)) {
      const rect = hero.getBoundingClientRect();
      const position = clamp(window.scrollY / Math.max(1, rect.top + rect.height + window.scrollY));
      hero.style.setProperty("--scene-scroll", `${(position * 36).toFixed(2)}px`);
      hero.style.setProperty("--scene-turn", `${(position * 6).toFixed(2)}deg`);
    }
    if (wordmark && visible.has(wordmark)) {
      const rect = wordmark.getBoundingClientRect();
      const position = clamp((window.innerHeight - rect.top) / Math.max(1, window.innerHeight + rect.height));
      wordmark.style.setProperty("--wordmark-shift", `${(position * 24).toFixed(2)}px`);
    }
  }

  function render() {
    frame = 0;
    if (!active()) return;
    if (scrollDirty) updateScroll();
    scrollDirty = false;
    if (finePointer?.matches) {
      pointerUpdates.forEach(({ x, y, apply }, element) => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        apply(clamp((x - rect.left) / rect.width), clamp((y - rect.top) / rect.height));
      });
    }
    pointerUpdates.clear();
  }

  function schedule() {
    if (active() && !frame && window.requestAnimationFrame)
      frame = window.requestAnimationFrame(render);
  }
  function scheduleScroll() {
    if (!active()) return;
    scrollDirty = true;
    schedule();
  }
  function clearMotion() {
    if (frame) window.cancelAnimationFrame?.(frame);
    frame = 0;
    scrollDirty = false;
    pointerUpdates.clear();
    pointerResets.forEach((reset) => reset());
    hero?.style.removeProperty("--scene-scroll");
    hero?.style.removeProperty("--scene-turn");
    wordmark?.style.removeProperty("--wordmark-shift");
    progress?.style.removeProperty("--reading-progress");
  }
  function trackPointer(element, properties, apply) {
    if (!element) return;
    const reset = () => {
      pointerUpdates.delete(element);
      properties.forEach((property) => element.style.removeProperty(property));
    };
    pointerResets.push(reset);
    element.addEventListener("pointermove", (event) => {
      if (!active() || !finePointer?.matches || event.pointerType === "touch") return;
      pointerUpdates.set(element, { x: event.clientX, y: event.clientY, apply });
      schedule();
    }, { passive: true });
    element.addEventListener("pointerleave", reset);
    element.addEventListener("pointercancel", reset);
    element.addEventListener("focusin", reset);
    element.addEventListener("focusout", reset);
  }
  trackPointer(stage, ["--pointer-x", "--pointer-y"], (x, y) => {
    stage.style.setProperty("--pointer-x", `${((x - 0.5) * 14).toFixed(2)}px`);
    stage.style.setProperty("--pointer-y", `${((y - 0.5) * 10).toFixed(2)}px`);
  });
  features.forEach((element) => trackPointer(element, ["--spot-x", "--spot-y"], (x, y) => {
    element.style.setProperty("--spot-x", `${(x * 100).toFixed(2)}%`);
    element.style.setProperty("--spot-y", `${(y * 100).toFixed(2)}%`);
  }));
  magnetic.forEach((element) => trackPointer(element, ["--button-x", "--button-y"], (x, y) => {
    element.style.setProperty("--button-x", `${((x - 0.5) * 6).toFixed(2)}px`);
    element.style.setProperty("--button-y", `${((y - 0.5) * 6).toFixed(2)}px`);
  }));

  scenes.forEach((element) => element.setAttribute("data-scene-visible", "false"));
  if (window.IntersectionObserver) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) visible.add(target);
        else visible.delete(target);
        if (scenes.includes(target)) target.setAttribute("data-scene-visible", String(isIntersecting));
      });
      scheduleScroll();
    }, { threshold: 0 });
    new Set([...scenes, hero, wordmark].filter(Boolean)).forEach((element) => observer.observe(element));
  }

  function applyPreference() {
    const previous = root.getAttribute("data-effects");
    const state = reduced?.matches ? "reduced" : paused ? "paused" : "active";
    root.setAttribute("data-effects", state);
    root.setAttribute("data-page-visible", String(!document.hidden));
    if (toggle) {
      toggle.hidden = false;
      toggle.disabled = Boolean(reduced?.matches);
      toggle.setAttribute("aria-pressed", String(state !== "active"));
      toggle.setAttribute("aria-label", state === "active" ? "暂停动效" : "开启动效");
      if (reduced?.matches) toggle.setAttribute("title", "系统已启用减少动态效果");
      else toggle.removeAttribute("title");
      if (label) label.textContent = state === "active" ? "暂停动效" : "开启动效";
    }
    if (active()) scheduleScroll();
    else clearMotion();
    if (previous && previous !== state && typeof CustomEvent === "function")
      document.dispatchEvent(new CustomEvent("lolicode:effectschange"));
  }
  toggle?.addEventListener("click", () => {
    if (reduced?.matches) return;
    paused = !paused;
    applyPreference();
  });
  const onPointerPreference = () => pointerResets.forEach((reset) => reset());
  if (reduced?.addEventListener) reduced.addEventListener("change", applyPreference);
  else reduced?.addListener?.(applyPreference);
  if (finePointer?.addEventListener) finePointer.addEventListener("change", onPointerPreference);
  else finePointer?.addListener?.(onPointerPreference);
  document.addEventListener("visibilitychange", applyPreference);
  window.addEventListener?.("scroll", scheduleScroll, { passive: true });
  window.addEventListener?.("resize", scheduleScroll, { passive: true });

  const film = document.querySelector?.("#product-film");
  const player = document.querySelector?.(".film-player");
  if (film && player) {
    const syncFilmDecoration = () => player.setAttribute("data-playing", String(!film.paused && !film.ended));
    ["play", "pause", "ended", "emptied", "error"].forEach((event) => film.addEventListener(event, syncFilmDecoration));
    syncFilmDecoration();
  }
  applyPreference();
})();

/* Native links remain useful without JS; the enhanced gallery adds keyboard
   tabs, preloaded image swaps and a modal with the browser's own focus trap. */
(() => {
  const tabs = document.querySelector?.(".preview-tabs");
  const preview = document.querySelector?.("#preview-image");
  const open = document.querySelector?.(".preview-open");
  const panel = document.querySelector?.("#workspace-preview");
  if (!tabs || !preview || !open || !panel) return;
  const buttons = [...tabs.querySelectorAll('[role="tab"]')];
  const hint = document.querySelector(".preview-hint");
  const defaultHint = hint.textContent;
  hint.setAttribute("role", "status");
  let request = 0;
  async function select(button) {
    const current = ++request;
    const image = new Image();
    image.src = button.dataset.previewSrc;
    panel.setAttribute("aria-busy", "true");
    preview.classList.add("is-changing");
    try {
      await image.decode();
      if (current !== request) return;
      preview.src = image.src;
      preview.alt = button.dataset.previewAlt;
      open.href = image.src;
      panel.setAttribute("aria-labelledby", button.id);
      buttons.forEach((item) => {
        item.setAttribute("aria-selected", String(item === button));
        item.tabIndex = item === button ? 0 : -1;
      });
      hint.textContent = defaultHint;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
          !["paused", "reduced"].includes(document.documentElement?.getAttribute?.("data-effects"))) {
        preview.getAnimations().forEach((animation) => animation.cancel());
        preview.animate(
          [
            { opacity: 0.45, transform: "translateY(4px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 320, easing: "cubic-bezier(.2,.75,.25,1)" },
        );
      }
    } catch {
      if (current === request)
        hint.textContent = "这张预览暂时没加载出来，再点一次试试。";
    } finally {
      if (current === request) {
        panel.removeAttribute("aria-busy");
        preview.classList.remove("is-changing");
      }
    }
  }
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => select(button));
    button.addEventListener("keydown", (event) => {
      let next;
      if (["ArrowRight", "ArrowDown"].includes(event.key))
        next = (index + 1) % buttons.length;
      if (["ArrowLeft", "ArrowUp"].includes(event.key))
        next = (index - 1 + buttons.length) % buttons.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = buttons.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      buttons[next].focus();
      select(buttons[next]);
    });
  });
  tabs.hidden = false;
  document.addEventListener("lolicode:effectschange", () => {
    if (document.documentElement?.getAttribute?.("data-effects") !== "active")
      preview.getAnimations().forEach((animation) => animation.cancel());
  });
  const dialog = document.querySelector("#preview-dialog");
  if (!dialog?.showModal) return;
  const fullImage = dialog.querySelector("#preview-full-image");
  open.addEventListener("click", (event) => {
    event.preventDefault();
    fullImage.src = preview.src;
    fullImage.alt = preview.alt;
    dialog.showModal();
  });
  dialog
    .querySelector(".preview-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
})();
