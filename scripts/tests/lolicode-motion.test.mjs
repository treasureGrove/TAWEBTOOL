import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../../lolicode/assets/motion.js", import.meta.url), "utf8");
function run({ reduced = false, observer = true } = {}) {
  const events = {};
  const observers = [];
  const parent = {};
  const targets = [30, 1300].map((top) => ({
    attributes: {}, parentElement: parent,
    style: { setProperty() {}, removeProperty() {} },
    getBoundingClientRect: () => ({ top }),
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  }));
  const preference = { matches: reduced, addEventListener: (name, fn) => { events.preference = fn; } };
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
    observe(element) { this.targets.push(element); }
    unobserve(element) { this.targets = this.targets.filter((item) => item !== element); }
    disconnect() { this.targets = []; }
  }
  vm.runInNewContext(source, {
    window: { innerHeight: 800, matchMedia: () => preference, IntersectionObserver: observer ? Observer : undefined },
    IntersectionObserver: Observer,
    document: {
      querySelectorAll: (selector) => selector.includes(".hero-copy") ? targets : [],
      addEventListener: (name, fn) => { events[name] = fn; },
    },
  });
  return { targets, observers, preference, events };
}

test("reduced motion and missing observer leave every section visible", () => {
  for (const options of [{ reduced: true }, { observer: false }]) {
    const { targets, observers } = run(options);
    assert.equal(observers.length, 0);
    assert.ok(targets.every((element) => !("data-motion" in element.attributes)));
  }
});
test("initial viewport stays visible; lower content enters once", () => {
  const { targets, observers } = run();
  assert.equal(targets[0].attributes["data-motion"], undefined);
  assert.equal(targets[1].attributes["data-motion"], "pending");
  observers[0].callback([{ target: targets[1], isIntersecting: true }]);
  assert.equal(targets[1].attributes["data-motion"], "visible");
  assert.equal(observers[0].targets.length, 0);
});
test("keyboard focus reveals its pending ancestor immediately", () => {
  const { targets, events } = run();
  events.focusin({ target: { closest: () => targets[1] } });
  assert.equal(targets[1].attributes["data-motion"], "visible");
});
test("enabling reduced motion disconnects observers and restores content", () => {
  const { targets, preference, events, observers } = run();
  preference.matches = true;
  events.preference();
  assert.ok(targets.every((element) => !("data-motion" in element.attributes)));
  assert.ok(observers.every((item) => item.targets.length === 0));
});

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function eventTarget(initial = {}) {
  const listeners = new Map();
  return Object.assign(initial, {
    addEventListener(name, listener) {
      listeners.set(name, [...(listeners.get(name) || []), listener]);
    },
    emit(name, event = {}) {
      for (const listener of listeners.get(name) || []) listener(event);
    },
  });
}

function runFilm({ reduced = false, observer = true } = {}) {
  const preference = eventTarget({ matches: reduced });
  const play = eventTarget({ hidden: true });
  const error = eventTarget({ hidden: true });
  const observers = [];
  const film = eventTarget({
    paused: true, muted: false, controls: true, playCalls: 0, pauseCalls: 0,
    nextResult: null,
    play() {
      this.playCalls += 1;
      const result = this.nextResult;
      this.nextResult = null;
      if (result instanceof Error) return Promise.reject(result);
      this.paused = false;
      queueMicrotask(() => this.emit("play"));
      return result || Promise.resolve();
    },
    pause() {
      if (this.paused) return;
      this.pauseCalls += 1;
      this.paused = true;
      queueMicrotask(() => this.emit("pause"));
    },
    focus() {},
  });
  const document = eventTarget({
    hidden: false,
    querySelector: (selector) => ({
      "#product-film": film, ".film-play": play, ".film-error": error,
    })[selector] || null,
    querySelectorAll: () => [],
  });
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
    observe(element) { this.targets.push(element); }
    disconnect() { this.targets = []; }
  }
  vm.runInNewContext(source, {
    window: { innerHeight: 800, matchMedia: () => preference, IntersectionObserver: observer ? Observer : undefined },
    IntersectionObserver: Observer,
    document,
  });
  const filmObserver = observers.find((item) => item.targets.includes(film));
  return {
    film, play, error, preference, document,
    intersect(ratio) {
      filmObserver.callback([{ target: film, isIntersecting: ratio > 0, intersectionRatio: ratio }]);
    },
    motion(reducedMotion) {
      preference.matches = reducedMotion;
      preference.emit("change");
    },
  };
}

test("film markup supports muted inline looping without eager autoplay", async () => {
  const html = await readFile(new URL("../../lolicode/index.html", import.meta.url), "utf8");
  const video = html.match(/<video\b[^>]*id="product-film"[^>]*>/)[0];
  for (const attribute of ["muted", "playsinline", "loop", "controls"]) {
    assert.match(video, new RegExp(`\\s${attribute}(?:\\s|>)`));
  }
  assert.match(video, /preload="none"/);
  assert.doesNotMatch(video, /\sautoplay(?:\s|=|>)/);
});

test("film requests no playback offscreen and resumes after visibility pauses", async () => {
  const { film, play, intersect } = runFilm();
  assert.equal(film.playCalls, 0);
  intersect(0.05);
  assert.equal(film.playCalls, 0);
  intersect(0.6);
  await settle();
  assert.equal(film.playCalls, 1);
  assert.equal(film.muted, true);
  assert.equal(film.controls, true);
  assert.equal(play.hidden, true);
  intersect(0);
  await settle();
  assert.equal(film.paused, true);
  intersect(0.6);
  await settle();
  assert.equal(film.playCalls, 2);
  assert.equal(film.paused, false);
});

test("native user pause survives viewport and tab changes until explicit play", async () => {
  const { film, document, intersect } = runFilm();
  intersect(0.8);
  await settle();
  film.pause();
  await settle();
  intersect(0);
  intersect(0.8);
  document.hidden = true;
  document.emit("visibilitychange");
  document.hidden = false;
  document.emit("visibilitychange");
  await settle();
  assert.equal(film.playCalls, 1);
  assert.equal(film.paused, true);
  await film.play();
  await settle();
  intersect(0);
  await settle();
  intersect(0.8);
  await settle();
  assert.equal(film.playCalls, 3);
  assert.equal(film.paused, false);
});

test("background tabs pause playback and visible tabs can resume autoplay", async () => {
  const { film, document, intersect } = runFilm();
  intersect(0.8);
  await settle();
  document.hidden = true;
  document.emit("visibilitychange");
  await settle();
  assert.equal(film.paused, true);
  document.hidden = false;
  document.emit("visibilitychange");
  await settle();
  assert.equal(film.playCalls, 2);
});

test("reduced motion requires manual playback, including after re-entry", async () => {
  const { film, play, intersect, motion } = runFilm({ reduced: true });
  intersect(0.8);
  await settle();
  assert.equal(film.playCalls, 0);
  play.emit("click");
  await settle();
  assert.equal(film.paused, false);
  intersect(0);
  await settle();
  intersect(0.8);
  await settle();
  assert.equal(film.paused, true);
  assert.equal(film.playCalls, 1);
  motion(false);
  await settle();
  assert.equal(film.paused, false);
  motion(true);
  await settle();
  assert.equal(film.paused, true);
  play.emit("click");
  await settle();
  assert.equal(film.paused, false);
});

test("browser autoplay rejection offers a manual retry without an error banner", async () => {
  const { film, play, error, intersect } = runFilm();
  film.nextResult = Object.assign(new Error("gesture required"), { name: "NotAllowedError" });
  intersect(0.8);
  await settle();
  assert.equal(play.hidden, false);
  assert.equal(error.hidden, true);
  assert.equal(film.controls, true);
  intersect(0);
  intersect(0.8);
  await settle();
  assert.equal(film.playCalls, 1);
  play.emit("click");
  await settle();
  assert.equal(film.playCalls, 2);
  assert.equal(film.paused, false);
});

test("a stale aborted play does not hide a newer successful playback", async () => {
  const { film, play, error, intersect } = runFilm();
  let rejectFirst;
  film.nextResult = new Promise((resolve, reject) => { rejectFirst = reject; });
  intersect(0.8);
  await settle();
  intersect(0);
  await settle();
  intersect(0.8);
  await settle();
  rejectFirst(Object.assign(new Error("interrupted"), { name: "AbortError" }));
  await settle();
  assert.equal(film.paused, false);
  assert.equal(play.hidden, true);
  assert.equal(error.hidden, true);
});

test("missing visibility observers keep a working manual playback fallback", async () => {
  const { film, play } = runFilm({ observer: false });
  assert.equal(film.playCalls, 0);
  play.emit("click");
  await settle();
  assert.equal(film.paused, false);
  assert.equal(film.controls, true);
});

test("media failures preserve native controls and show the direct-video fallback", () => {
  const { film, play, error } = runFilm();
  film.emit("error");
  assert.equal(film.controls, true);
  assert.equal(play.hidden, true);
  assert.equal(error.hidden, false);
});

function sceneElement(rect = { top: 100, left: 0, width: 200, height: 100 }) {
  const attributes = new Map();
  const styles = new Map();
  return eventTarget({
    rect, reads: 0, attributes, styles, hidden: true,
    style: {
      setProperty: (name, value) => styles.set(name, value),
      removeProperty: (name) => styles.delete(name),
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name) ?? null,
    removeAttribute: (name) => attributes.delete(name),
    getBoundingClientRect() { this.reads += 1; return this.rect; },
  });
}

function runScene({ reduced = false, fine = true, observer = true } = {}) {
  const root = sceneElement();
  root.scrollHeight = 4000;
  const toggle = sceneElement();
  const label = { textContent: "" };
  toggle.querySelector = () => label;
  const hero = sceneElement({ top: 100, left: 0, width: 600, height: 500 });
  const stage = sceneElement();
  const feature = sceneElement();
  const button = sceneElement();
  const ribbon = sceneElement();
  const closing = sceneElement();
  const wordmark = sceneElement({ top: 700, left: 0, width: 500, height: 200 });
  const progress = sceneElement();
  const player = sceneElement();
  const film = eventTarget({ paused: false, ended: false });
  const lower = sceneElement({ top: 1300 });
  lower.parentElement = {};
  const reducedPreference = eventTarget({ matches: reduced });
  const finePreference = eventTarget({ matches: fine });
  const selectors = {
    "[data-motion-toggle]": toggle, "[data-parallax]": stage,
    ".hero-visual": hero, ".footer-wordmark": wordmark, ".reading-progress": progress,
    "#product-film": film, ".film-player": player,
  };
  const scenes = [stage, ribbon, feature, closing];
  const document = eventTarget({
    documentElement: root, hidden: false,
    querySelector: (selector) => selectors[selector] || null,
    querySelectorAll: (selector) => {
      if (selector.includes(".hero-copy")) return [hero, lower];
      if (selector === ".companion-stage, .studio-ribbon, .feature, .closing-section") return scenes;
      if (selector === ".feature") return [feature];
      if (selector === "[data-magnetic]") return [button];
      return [];
    },
    dispatchEvent(event) { this.emit(event.type, event); },
  });
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
    observe(element) { this.targets.push(element); }
    unobserve(element) { this.targets = this.targets.filter((item) => item !== element); }
    disconnect() { this.targets = []; }
  }
  let frameID = 0;
  const frames = new Map();
  const window = eventTarget({
    innerHeight: 800, scrollY: 0, IntersectionObserver: observer ? Observer : undefined,
    matchMedia: (query) => query.includes("reduced-motion") ? reducedPreference : finePreference,
    requestAnimationFrame(callback) { frames.set(++frameID, callback); return frameID; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  vm.runInNewContext(source, {
    document, window, IntersectionObserver: Observer,
    CustomEvent: class { constructor(type) { this.type = type; } },
  });
  const sceneObserver = observers.find((item) => item.targets.includes(ribbon));
  return {
    root, toggle, label, hero, stage, feature, button, ribbon, closing, wordmark,
    progress, player, film, lower, document, window, frames,
    flush() {
      const current = [...frames.values()];
      frames.clear();
      current.forEach((callback) => callback());
    },
    intersect(element, isIntersecting = true) {
      sceneObserver.callback([{ target: element, isIntersecting }]);
    },
    motion(value) { reducedPreference.matches = value; reducedPreference.emit("change"); },
    pointer(value) { finePreference.matches = value; finePreference.emit("change"); },
  };
}

test("scene switch pauses decoration, reveals content and leaves film playback independent", () => {
  const scene = runScene();
  const { root, toggle, label, lower, film, player, frames, window } = scene;
  assert.equal(root.getAttribute("data-effects"), "active");
  assert.equal(toggle.hidden, false);
  assert.equal(label.textContent, "暂停动效");
  assert.equal(lower.getAttribute("data-motion"), "pending");
  assert.equal(player.getAttribute("data-playing"), "true");
  toggle.emit("click");
  assert.equal(root.getAttribute("data-effects"), "paused");
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.equal(label.textContent, "开启动效");
  assert.equal(lower.getAttribute("data-motion"), null);
  assert.equal(film.paused, false);
  assert.equal(player.getAttribute("data-playing"), "true");
  assert.equal(frames.size, 0);
  window.emit("scroll");
  assert.equal(frames.size, 0);
  toggle.emit("click");
  assert.equal(root.getAttribute("data-effects"), "active");
  assert.equal(lower.getAttribute("data-motion"), "pending");
  film.paused = true;
  film.emit("pause");
  assert.equal(player.getAttribute("data-playing"), "false");
});

test("system reduced motion wins and preserves the user's earlier pause choice", () => {
  const { root, toggle, label, frames, motion } = runScene({ reduced: true });
  assert.equal(root.getAttribute("data-effects"), "reduced");
  assert.equal(toggle.disabled, true);
  assert.equal(label.textContent, "开启动效");
  assert.equal(frames.size, 0);
  toggle.emit("click");
  assert.equal(root.getAttribute("data-effects"), "reduced");
  motion(false);
  assert.equal(root.getAttribute("data-effects"), "active");
  assert.equal(toggle.disabled, false);
  toggle.emit("click");
  motion(true);
  motion(false);
  assert.equal(root.getAttribute("data-effects"), "paused");
  assert.equal(frames.size, 0);
});

test("scene visibility follows intersection and distant scenes avoid layout reads", () => {
  const { hero, wordmark, ribbon, window, flush, intersect, frames } = runScene();
  assert.equal(ribbon.getAttribute("data-scene-visible"), "false");
  flush();
  const heroReads = hero.reads;
  const wordmarkReads = wordmark.reads;
  window.emit("scroll");
  flush();
  assert.equal(hero.reads, heroReads);
  assert.equal(wordmark.reads, wordmarkReads);
  intersect(ribbon);
  assert.equal(ribbon.getAttribute("data-scene-visible"), "true");
  intersect(ribbon, false);
  assert.equal(ribbon.getAttribute("data-scene-visible"), "false");
  flush();
  assert.equal(frames.size, 0);
});

test("scroll and pointer work coalesce into one bounded frame without a continuing loop", () => {
  const { hero, wordmark, button, feature, window, intersect, flush, frames } = runScene();
  intersect(hero);
  intersect(wordmark);
  window.scrollY = 99999;
  hero.rect.top = -99999;
  wordmark.rect.top = -500;
  for (let index = 0; index < 20; index += 1) window.emit("scroll");
  button.emit("pointermove", { clientX: 9999, clientY: -9999, pointerType: "mouse" });
  feature.emit("pointermove", { clientX: 50, clientY: 175, pointerType: "mouse" });
  assert.equal(frames.size, 1);
  flush();
  assert.equal(hero.styles.get("--scene-scroll"), "36.00px");
  assert.equal(hero.styles.get("--scene-turn"), "6.00deg");
  assert.equal(wordmark.styles.get("--wordmark-shift"), "24.00px");
  assert.equal(button.styles.get("--button-x"), "3.00px");
  assert.equal(button.styles.get("--button-y"), "-3.00px");
  assert.equal(feature.styles.get("--spot-x"), "25.00%");
  assert.equal(feature.styles.get("--spot-y"), "75.00%");
  assert.equal(frames.size, 0);
});

test("leaving or keyboard focusing a pointer target clears pending and applied offsets", () => {
  const { button, feature, flush } = runScene();
  button.emit("pointermove", { clientX: 190, clientY: 190, pointerType: "mouse" });
  button.emit("pointerleave");
  flush();
  assert.equal(button.styles.size, 0);
  feature.emit("pointermove", { clientX: 190, clientY: 190, pointerType: "mouse" });
  flush();
  assert.equal(feature.styles.get("--spot-x"), "95.00%");
  feature.emit("focusin");
  assert.equal(feature.styles.size, 0);
});

test("touch and coarse pointers never apply hover motion and preference changes clear offsets", () => {
  const { button, feature, pointer, flush, frames } = runScene();
  flush();
  button.emit("pointermove", { clientX: 190, clientY: 190, pointerType: "touch" });
  assert.equal(frames.size, 0);
  feature.emit("pointermove", { clientX: 190, clientY: 190, pointerType: "mouse" });
  flush();
  assert.equal(feature.styles.get("--spot-x"), "95.00%");
  pointer(false);
  assert.equal(feature.styles.size, 0);
  button.emit("pointermove", { clientX: 190, clientY: 190, pointerType: "mouse" });
  assert.equal(frames.size, 0);
});

test("pausing or hiding the page clears movement and cancels scheduled work", () => {
  const { root, hero, button, wordmark, toggle, document, window, intersect, frames, flush } = runScene();
  intersect(hero);
  intersect(wordmark);
  window.scrollY = 100;
  button.emit("pointermove", { clientX: 190, clientY: 190, pointerType: "mouse" });
  flush();
  assert.ok(hero.styles.has("--scene-scroll"));
  assert.ok(button.styles.has("--button-x"));
  window.emit("scroll");
  document.hidden = true;
  document.emit("visibilitychange");
  assert.equal(root.getAttribute("data-page-visible"), "false");
  assert.equal(frames.size, 0);
  assert.equal(hero.styles.has("--scene-scroll"), false);
  assert.equal(button.styles.size, 0);
  assert.equal(wordmark.styles.has("--wordmark-shift"), false);
  window.emit("scroll");
  assert.equal(frames.size, 0);
  document.hidden = false;
  document.emit("visibilitychange");
  assert.equal(root.getAttribute("data-page-visible"), "true");
  assert.equal(frames.size, 1);
  flush();
  toggle.emit("click");
  button.emit("pointermove", { clientX: 190, clientY: 190, pointerType: "mouse" });
  assert.equal(frames.size, 0);
  assert.equal(button.styles.size, 0);
});

test("missing observers leave all content visible and scenes static", () => {
  const { lower, ribbon, hero, window, flush } = runScene({ observer: false });
  assert.equal(lower.getAttribute("data-motion"), null);
  assert.equal(ribbon.getAttribute("data-scene-visible"), "false");
  window.scrollY = 100;
  window.emit("scroll");
  flush();
  assert.equal(hero.styles.has("--scene-scroll"), false);
});

test("keyboard focus still reveals a pending section after motion is resumed", () => {
  const { toggle, lower, document } = runScene();
  toggle.emit("click");
  toggle.emit("click");
  assert.equal(lower.getAttribute("data-motion"), "pending");
  document.emit("focusin", { target: { closest: () => lower } });
  assert.equal(lower.getAttribute("data-motion"), "visible");
});
