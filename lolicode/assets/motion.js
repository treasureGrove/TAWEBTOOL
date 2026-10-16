/* Progressive enhancement: content and downloads work without this script. */
(() => {
  const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const targets = document.querySelectorAll(
    ".hero-copy, .hero-visual, .section-heading, .feature, .start-heading, .start-steps li, .expand-heading, .expand-details article, .updates-heading, .release-details, .closing-section",
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
    document.querySelectorAll('.header-nav [aria-current="location"]').forEach((link) => {
      link.removeAttribute("aria-current");
    });
  }

  function start() {
    clear();
    if (preference?.matches || !window.IntersectionObserver) return;
    reveal = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        target.setAttribute("data-motion", "visible");
        reveal.unobserve(target);
      });
    }, { threshold: 0.04 });
    let group = null;
    let position = 0;
    targets.forEach((element) => {
      // No above-the-fold content is hidden while the page starts up.
      if (element.getBoundingClientRect().top < window.innerHeight) return;
      if (element.parentElement !== group) { group = element.parentElement; position = 0; }
      element.style.setProperty("--entrance-delay", `${Math.min(position++, 3) * 55}ms`);
      element.setAttribute("data-motion", "pending");
      reveal.observe(element);
    });
    navigation = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        document.querySelectorAll('.header-nav a[href^="#"]').forEach((link) => {
          if (link.hash === `#${target.id}`) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-10% 0px -55% 0px", threshold: 0 });
    document.querySelectorAll(".hero, #features, #start, #updates").forEach((section) => navigation.observe(section));
  }

  // Keyboard navigation must never land in an invisible pending section.
  document.addEventListener("focusin", (event) => {
    const target = event.target.closest?.('[data-motion="pending"]');
    if (target) { target.setAttribute("data-motion", "visible"); reveal?.unobserve(target); }
  });
  if (preference?.addEventListener) preference.addEventListener("change", start);
  else preference?.addListener?.(start);
  start();
})();
