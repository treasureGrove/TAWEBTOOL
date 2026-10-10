// DOM layer: loading screen, control dock, keyboard shortcuts, toasts, help card and idle fade.
// main.js owns the simulation; this module only talks to it through the callbacks handed to bind().
import { ATMOS } from './atmosphere.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const VIEW_ORDER = ['hero', 'side', 'front', 'chase', 'face'];
export const ATMOS_ORDER = ['golden', 'morning', 'noon', 'dusk'];
const ATMOS_KEYS = { q: 'golden', w: 'morning', e: 'noon', r: 'dusk' };
const CLOCK = { golden: '17:40', morning: '06:20', noon: '12:30', dusk: '18:55' };
const IDLE_MS = 7500;

// ---------------------------------------------------------------------------------------------
// Loading screen
// ---------------------------------------------------------------------------------------------
export function createLoader() {
  const root = $('#loading');
  const bar = root && $('.bar i', root);
  const msg = root && $('.msg', root);
  return {
    set(p, text) {
      if (bar) bar.style.transform = `scaleX(${Math.max(0.04, Math.min(1, p))})`;
      if (msg && text) msg.textContent = text;
    },
    done() {
      const body = document.body;
      body.classList.add('reveal');
      body.classList.remove('is-loading');
      setTimeout(() => body.classList.remove('reveal'), 3200);
      if (!root) return;
      root.classList.add('hidden');
      setTimeout(() => root.remove(), 1800);
    },
    fail(text) {
      if (!root) return;
      root.classList.add('failed');
      if (msg) msg.textContent = text;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------------------------
export function createUI({ shot = false } = {}) {
  const body = document.body;
  const dock = $('#dock');
  const toastEl = $('#toast');
  const hintEl = $('#hint');
  const flashEl = $('#flash');
  const helpEl = $('#help');
  const speedIn = $('#speed');
  const speedOut = $('#speedOut');
  const btn = {
    play: $('#btnPlay'),
    orbit: $('#btnOrbit'),
    shot: $('#btnShot'),
    full: $('#btnFull'),
    hide: $('#btnHide'),
    help: $('#btnHelp'),
    unhide: $('#unhide'),
  };
  const segs = $$('.seg');
  let actions = null;
  let helpOpen = false;
  let helpReturn = null;
  let uiHidden = false;
  let lastKmh = -1;
  let toastTimer = 0;
  let hintTimer = 0;
  let lastActive = performance.now();
  let idle = false;

  if (shot) body.classList.add('no-anim');
  if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) btn.full.hidden = true;

  // ----- sliding highlight under the active segment button
  function place(seg) {
    const thumb = $('.thumb', seg);
    const active = $('button.active', seg);
    if (!thumb) return;
    if (!active || !active.offsetWidth) {
      seg.classList.add('none');
      return;
    }
    seg.classList.remove('none');
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  }
  function placeAll(instant = false) {
    for (const s of segs) {
      if (instant) s.classList.add('nt');
      place(s);
    }
    if (instant) {
      requestAnimationFrame(() => requestAnimationFrame(() => segs.forEach((s) => s.classList.remove('nt'))));
    }
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      placeAll(true);
      document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight}px`);
    }).observe(dock);
  }
  window.addEventListener('resize', () => placeAll(true));
  document.fonts?.ready?.then(() => placeAll(true));

  // ----- sky swatches come straight from the presets so they can never drift out of sync
  for (const b of $$('[data-atmos]')) {
    const p = ATMOS[b.dataset.atmos];
    const sw = $('.sw', b);
    if (!p || !sw) continue;
    sw.style.setProperty(
      '--sw',
      `radial-gradient(circle at 70% 76%, ${p.sunColor} 0 15%, transparent 46%), linear-gradient(165deg, ${p.zenith} 0%, ${p.mid} 38%, ${p.low} 68%, ${p.horizon} 100%)`
    );
  }

  // ----- state mirrors
  function setView(name) {
    for (const b of $$('[data-view]')) {
      const on = b.dataset.view === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    place($('#segView'));
  }
  function setAtmos(name) {
    const p = ATMOS[name];
    if (!p) return;
    body.dataset.atmos = name;
    for (const b of $$('[data-atmos]')) {
      const on = b.dataset.atmos === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    $('#metaLabel').textContent = p.label;
    $('#metaClock').textContent = CLOCK[name] || '';
    place($('#segAtmos'));
  }
  function setPaused(on) {
    btn.play.setAttribute('aria-pressed', String(on));
    btn.play.setAttribute('aria-label', on ? '继续' : '暂停');
  }
  function setOrbit(on) {
    btn.orbit.setAttribute('aria-pressed', String(on));
  }
  function setFullscreen(on) {
    btn.full.setAttribute('aria-pressed', String(on));
    btn.full.setAttribute('aria-label', on ? '退出全屏' : '全屏');
  }
  function setSpeed(f) {
    const min = parseFloat(speedIn.min);
    const max = parseFloat(speedIn.max);
    speedIn.value = f;
    speedIn.style.setProperty('--pf', String(Math.min(1, Math.max(0, (f - min) / (max - min)))));
  }
  function setKmh(v) {
    const n = Math.round(v);
    if (n === lastKmh) return;
    lastKmh = n;
    speedOut.textContent = `${n} km/h`;
  }

  // ----- transient messages
  function toast(msg, ms = 2000) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }
  function hint(html, ms = 14000) {
    hintEl.innerHTML = html;
    hintEl.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, ms);
  }
  function hideHint() {
    clearTimeout(hintTimer);
    hintEl.classList.remove('show');
  }
  function flash() {
    flashEl.classList.remove('go');
    void flashEl.offsetWidth;
    flashEl.classList.add('go');
  }

  // ----- idle fade: the dock steps aside so the scene can be looked at undisturbed
  function wake() {
    lastActive = performance.now();
    if (idle) {
      idle = false;
      body.classList.remove('idle');
    }
  }
  function startIdleClock() {
    lastActive = performance.now();
  }
  if (!shot) {
    for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart']) window.addEventListener(ev, wake, { passive: true });
    setInterval(() => {
      if (idle || helpOpen || uiHidden) return;
      if (performance.now() - lastActive < IDLE_MS) return;
      if (dock.matches(':hover') || dock.contains(document.activeElement)) return;
      idle = true;
      body.classList.add('idle');
    }, 500);
  }

  // ----- help card
  function toggleHelp(force) {
    const open = force ?? !helpOpen;
    if (open === helpOpen) return;
    helpOpen = open;
    helpEl.classList.toggle('open', open);
    helpEl.setAttribute('aria-hidden', String(!open));
    if (open) {
      helpReturn = document.activeElement;
      $('[data-close]', helpEl).focus({ preventScroll: true });
    } else if (helpReturn && helpReturn.focus) {
      helpReturn.focus({ preventScroll: true });
      if (helpReturn.blur && document.activeElement === helpReturn) helpReturn.blur();
      helpReturn = null;
    }
  }
  function toggleHidden(force) {
    const hide = force ?? !uiHidden;
    if (hide === uiHidden) return;
    uiHidden = hide;
    if (hide) toggleHelp(false);
    body.classList.toggle('ui-off', hide);
    if (hide) toast('界面已隐藏 · 按 H 或点右上角的眼睛恢复', 2600);
    else wake();
  }

  // ----- held keys for smooth camera motion (read by main.js every frame)
  const axes = { yaw: 0, zoom: 0 };
  const held = new Set();
  function syncAxes() {
    axes.yaw = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
    axes.zoom = (held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0);
  }

  // ----- wiring
  function bind(a) {
    actions = a;
    const click = (el, fn) =>
      el.addEventListener('click', (e) => {
        fn(e);
        if (e.detail) el.blur(); // keep Space/Enter free for the global shortcuts after a mouse click
      });
    $$('[data-view]').forEach((b) => click(b, () => a.view(b.dataset.view)));
    $$('[data-atmos]').forEach((b) => click(b, () => a.atmos(b.dataset.atmos)));
    click(btn.play, () => a.pause());
    click(btn.orbit, () => a.orbit());
    click(btn.shot, () => a.shot());
    click(btn.full, () => a.fullscreen());
    click(btn.hide, () => toggleHidden(true));
    click(btn.unhide, () => toggleHidden(false));
    click(btn.help, () => toggleHelp());
    speedIn.addEventListener('input', () => a.speed(parseFloat(speedIn.value)));
    speedIn.addEventListener('change', () => speedIn.blur());
    helpEl.addEventListener('click', (e) => {
      if (e.target === helpEl || e.target.closest('[data-close]')) toggleHelp(false);
    });
    helpEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        $('[data-close]', helpEl).focus();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const k = e.key;
      const tag = e.target && e.target.tagName;
      const onField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const onButton = tag === 'BUTTON';

      if (k === 'Escape') {
        if (helpOpen) toggleHelp(false);
        return;
      }
      if (helpOpen) {
        if (k === '?' || k === '/') toggleHelp(false);
        return;
      }
      if (k.startsWith('Arrow')) {
        if (onField) return; // arrows belong to a focused slider
        e.preventDefault();
        held.add(k);
        syncAxes();
        return;
      }
      if (e.repeat) return;
      if (k === ' ' || k === 'Spacebar') {
        if (onButton || onField) return; // let a focused control handle its own activation
        e.preventDefault();
        a.pause();
        return;
      }
      if (onField) return;
      const low = k.length === 1 ? k.toLowerCase() : k;
      if (low >= '1' && low <= '5') a.view(VIEW_ORDER[+low - 1]);
      else if (ATMOS_KEYS[low]) a.atmos(ATMOS_KEYS[low]);
      else if (low === 't') a.atmosNext();
      else if (low === 'o') a.orbit();
      else if (low === 'p') a.shot();
      else if (low === 'f') a.fullscreen();
      else if (low === 'h') toggleHidden();
      else if (low === '?' || low === '/') toggleHelp(true);
      else if (low === '=' || low === '+' || low === ']') a.speedStep(1);
      else if (low === '-' || low === '_' || low === '[') a.speedStep(-1);
    });
    window.addEventListener('keyup', (e) => {
      if (held.delete(e.key)) syncAxes();
    });
    window.addEventListener('blur', () => {
      held.clear();
      syncAxes();
    });
    document.addEventListener('fullscreenchange', () => setFullscreen(!!document.fullscreenElement));
    document.addEventListener('webkitfullscreenchange', () => setFullscreen(!!document.webkitFullscreenElement));
  }

  placeAll(true);
  return {
    bind,
    axes,
    setView,
    setAtmos,
    setPaused,
    setOrbit,
    setSpeed,
    setKmh,
    setFullscreen,
    toast,
    hint,
    hideHint,
    flash,
    wake,
    startIdleClock,
    toggleHelp,
    get helpOpen() {
      return helpOpen;
    },
  };
}
