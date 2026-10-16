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
