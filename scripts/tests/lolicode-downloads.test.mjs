import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../../lolicode/assets/downloads.js", import.meta.url),
  "utf8",
);
const toolsRoot = "https://tools.treasuregrove.art/lolicode/releases/4.0.16/";
const homeRoot = "https://lolicode.com/downloads/releases/4.0.16/";
const githubRoot = "https://github.com/treasureGrove/LoliCode-Releases/releases/download/lolicode-v4.0.16/";
function release(root = toolsRoot) {
  return {
    version: "4.0.16",
    pub_date: "2026-10-16T10:00:00Z",
    notes: "真实发布说明",
    platforms: {
      "windows-x86_64": {
        signature: "signed",
        url: `${root}LoliCode-Setup.exe`,
      },
    },
    downloads: {
      "windows-x86_64-portable": { url: `${root}LoliCode-Portable.zip` },
    },
  };
}

async function run({
  manifest = release(),
  profile = "tools",
  fetchError = false,
} = {}) {
  const ids = [
    "version",
    "status",
    "installer",
    "portable",
    "notes",
    "retry",
    "release-version",
    "release-date",
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        hidden: false,
        dataset: {},
        attrs: {},
        textContent: "",
        listeners: {},
        setAttribute(key, value) {
          this.attrs[key] = value;
        },
        removeAttribute(key) {
          delete this.attrs[key];
          if (key === "href") delete this.href;
        },
        addEventListener(key, callback) {
          this.listeners[key] = callback;
        },
      },
    ]),
  );
  const requests = [];
  vm.runInNewContext(source, {
    document: {
      getElementById(id) {
        assert.ok(elements[id], id);
        return elements[id];
      },
      querySelector(selector) {
        assert.equal(selector, 'meta[name="lolicode-download-profile"]');
        return profile === null ? null : { content: profile };
      },
    },
    URL,
    AbortController,
    Intl,
    Date,
    Number,
    Map,
    Object,
    setTimeout,
    clearTimeout,
    fetch: async (url, options) => {
      requests.push(url);
      assert.equal(
        url,
        profile === "home"
          ? "/downloads/updates/latest.json"
          : "./updates/latest.json",
      );
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal);
      if (fetchError && requests.length === 1) throw new Error("offline");
      return { ok: true, json: async () => manifest };
    },
  });
  await new Promise(setImmediate);
  return { elements, requests };
}

function assertBlocked(elements) {
  assert.equal(elements.status.dataset.state, "error");
  assert.equal(elements.installer.href, undefined);
  assert.equal(elements.portable.href, undefined);
  assert.equal(elements.portable.hidden, true);
  assert.equal(elements.installer.attrs.tabindex, "-1");
  assert.equal(elements.retry.hidden, false);
}

test("tools feed enables both signed Windows downloads", async () => {
  const { elements: e } = await run();
  assert.equal(e.status.dataset.state, "ready");
  assert.equal(e.installer.href, `${toolsRoot}LoliCode-Setup.exe`);
  assert.equal(e.portable.href, `${toolsRoot}LoliCode-Portable.zip`);
  assert.equal(e.portable.hidden, false);
  assert.equal(e.installer.attrs.tabindex, undefined);
  assert.equal(e["release-version"].textContent, "v4.0.16");
  assert.equal(e["release-date"].hidden, false);
});
test("a valid installer remains usable without a portable archive", async () => {
  const manifest = release();
  delete manifest.downloads;
  const { elements: e } = await run({ manifest });
  assert.equal(e.status.dataset.state, "ready");
  assert.equal(e.portable.hidden, true);
  assert.ok(e.installer.href);
});
for (const [label, mutate] of [
  [
    "foreign origin",
    (m) => {
      m.platforms["windows-x86_64"].url = "https://evil.example/LoliCode.exe";
    },
  ],
  [
    "portable query string",
    (m) => {
      m.downloads["windows-x86_64-portable"].url += "?redirect=evil";
    },
  ],
  [
    "empty signature",
    (m) => {
      m.platforms["windows-x86_64"].signature = "";
    },
  ],
  [
    "missing Windows platform",
    (m) => {
      delete m.platforms["windows-x86_64"];
    },
  ],
]) {
  test(`${label} disables every download atomically`, async () => {
    const manifest = release();
    mutate(manifest);
    assertBlocked((await run({ manifest })).elements);
  });
}
test("offline failure can be retried", async () => {
  const { elements: e, requests } = await run({ fetchError: true });
  assertBlocked(e);
  e.retry.listeners.click();
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  assert.equal(e.status.dataset.state, "ready");
  assert.ok(e.installer.href);
});
test("release notes are assigned as text", async () => {
  const manifest = release();
  manifest.notes = "<img src=x onerror=alert(1)>";
  const { elements: e } = await run({ manifest });
  assert.equal(e.notes.textContent, manifest.notes);
  assert.equal(e.notes.innerHTML, undefined);
});
test("home profile uses the root-domain feed and mirrored downloads", async () => {
  const { elements: e, requests } = await run({
    profile: "home",
    manifest: release(homeRoot),
  });
  assert.equal(requests[0], "/downloads/updates/latest.json");
  assert.equal(e.status.dataset.state, "ready");
  assert.equal(e.installer.href, `${homeRoot}LoliCode-Setup.exe`);
  assert.equal(e.portable.href, `${homeRoot}LoliCode-Portable.zip`);
});
test("home feed may retain a trusted legacy download source", async () => {
  const { elements: e } = await run({ profile: "home" });
  assert.equal(e.status.dataset.state, "ready");
  assert.equal(e.installer.href, `${toolsRoot}LoliCode-Setup.exe`);
});
test("tools feed may reference the trusted mirror", async () => {
  const { elements: e } = await run({ manifest: release(homeRoot) });
  assert.equal(e.status.dataset.state, "ready");
  assert.equal(e.installer.href, `${homeRoot}LoliCode-Setup.exe`);
});
for (const profile of ["home", "tools"]) {
  test(`${profile} feed enables version-bound GitHub Release installer and portable`, async () => {
    const manifest = release(githubRoot);
    manifest.platforms["windows-x86_64"].url = `${githubRoot}LoliCode-4.0.16-Windows-x64-Setup.exe`;
    const { elements: e } = await run({ profile, manifest });
    assert.equal(e.status.dataset.state, "ready");
    assert.equal(e.installer.href, manifest.platforms["windows-x86_64"].url);
    assert.equal(e.portable.href, `${githubRoot}LoliCode-Portable.zip`);
    assert.equal(e.portable.hidden, false);
  });
}
for (const [label, root] of [
  ["different repository", "https://github.com/treasureGrove/TAI-Switch/releases/download/lolicode-v4.0.16/"],
  ["different owner", "https://github.com/another-owner/LoliCode-Releases/releases/download/lolicode-v4.0.16/"],
  ["different tag format", "https://github.com/treasureGrove/LoliCode-Releases/releases/download/v4.0.16/"],
  ["different release version", "https://github.com/treasureGrove/LoliCode-Releases/releases/download/lolicode-v4.0.15/"],
  ["non-release path", "https://github.com/treasureGrove/LoliCode/blob/main/"],
  ["unversioned latest download", "https://github.com/treasureGrove/LoliCode-Releases/releases/latest/download/"],
  ["nested asset path", `${githubRoot}nested/`],
]) {
  for (const portableArchive of [false, true]) {
    test(`GitHub ${label} in ${portableArchive ? "portable" : "installer"} disables all links`, async () => {
      const manifest = release(githubRoot);
      if (portableArchive) {
        manifest.downloads["windows-x86_64-portable"].url = `${root}LoliCode-Portable.zip`;
      } else {
        manifest.platforms["windows-x86_64"].url = `${root}LoliCode-Setup.exe`;
      }
      assertBlocked((await run({ profile: "home", manifest })).elements);
    });
  }
}
for (const [label, url] of [
  [
    "home origin with legacy prefix",
    "https://lolicode.com/lolicode/releases/4.0.16/LoliCode-Setup.exe",
  ],
  [
    "tools origin with home prefix",
    "https://tools.treasuregrove.art/downloads/releases/4.0.16/LoliCode-Setup.exe",
  ],
  [
    "different version",
    "https://lolicode.com/downloads/releases/4.0.15/LoliCode-Setup.exe",
  ],
  [
    "spoofed subdomain",
    "https://lolicode.com.evil.example/downloads/releases/4.0.16/LoliCode-Setup.exe",
  ],
  [
    "plain HTTP",
    "http://lolicode.com/downloads/releases/4.0.16/LoliCode-Setup.exe",
  ],
  [
    "userinfo",
    "https://user:pass@lolicode.com/downloads/releases/4.0.16/LoliCode-Setup.exe",
  ],
]) {
  test(`${label} is rejected`, async () => {
    const manifest = release(homeRoot);
    manifest.platforms["windows-x86_64"].url = url;
    assertBlocked((await run({ profile: "home", manifest })).elements);
  });
}
for (const profile of [
  "https://evil.example/feed.json",
  "__proto__",
  "unknown",
]) {
  test(`unrecognized profile ${profile} makes no request`, async () => {
    const { elements, requests } = await run({ profile });
    assertBlocked(elements);
    assert.equal(requests.length, 0);
  });
}
test("old tools HTML without metadata keeps its original feed", async () => {
  const { elements: e, requests } = await run({ profile: null });
  assert.equal(e.status.dataset.state, "ready");
  assert.equal(requests[0], "./updates/latest.json");
});
