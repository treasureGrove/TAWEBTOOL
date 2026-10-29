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

function githubBackup(version = "4.0.16") {
  const name = `LoliCode-${version}-Windows-x64-Setup.exe`;
  return {
    name,
    url: `https://github.com/treasureGrove/LoliCode-Releases/releases/download/lolicode-v${version}/${name}`,
    bytes: 21746554,
    sha256: "18b9388d68e12e281d465215738a108b84c791984f60a5abe45017e76c284ba0",
  };
}

async function run({
  manifest = release(),
  profile = "tools",
  fetchError = false,
  backupElement = true,
  tencentElements = true,
} = {}) {
  const makeNode = (tag) => ({
    tagName: tag,
    children: [],
    value: "",
    get textContent() { return this.value + this.children.map((child) => child.textContent).join(""); },
    set textContent(value) { this.value = value; this.children = []; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.value = ""; this.children = children; },
  });
  const ids = [
    "version",
    "status",
    "installer",
    "portable",
    "github-backup",
    "tencent-downloads",
    "tencent-installer",
    "tencent-portable",
    "notes",
    "retry",
    "release-version",
    "release-date",
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        ...makeNode("div"),
        hidden: false,
        dataset: {},
        attrs: {},
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
  // Object spread copies accessor values; retain the DOM-like text semantics.
  for (const element of Object.values(elements)) {
    Object.defineProperty(element, "textContent", {
      get() { return this.value + this.children.map((child) => child.textContent).join(""); },
      set(value) { this.value = value; this.children = []; },
    });
  }
  const requests = [];
  vm.runInNewContext(source, {
    document: {
      createElement: makeNode,
      getElementById(id) {
        if (id === "github-backup" && !backupElement) return null;
        if (id.startsWith("tencent-") && !tencentElements) return null;
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
  assert.equal(elements["github-backup"].href, undefined);
  assert.equal(elements["github-backup"].hidden, true);
  assert.equal(elements["github-backup"].attrs.tabindex, "-1");
  for (const id of ["tencent-installer", "tencent-portable"]) {
    assert.equal(elements[id].hidden, true);
    assert.equal(elements[id].href, undefined);
    assert.equal(elements[id].attrs.tabindex, "-1");
  }
  assert.equal(elements["tencent-downloads"].hidden, true);
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
  assert.equal(e["github-backup"].hidden, true);
  assert.equal(e["github-backup"].href, undefined);
  assert.equal(e["tencent-downloads"].hidden, true);
  assert.equal(e["tencent-installer"].hidden, true);
  assert.equal(e["tencent-portable"].hidden, true);
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

test("release notes show a semantic summary and retain complete details without HTML execution", async () => {
  const manifest = release();
  manifest.notes = "# LoliCode 4.0.16\r\n\r\n- First improvement\r\n- <img src=x onerror=alert(1)>\r\n\r\nLonger upgrade details.\r\nA continued paragraph.\r\n\r\n## Compatibility\r\n\r\nMore information.";
  const { elements: e } = await run({ manifest });
  assert.equal(e.notes.children[0].tagName, "ul");
  assert.equal(e.notes.children[0].children.length, 2);
  assert.equal(e.notes.children[0].children[1].textContent, "<img src=x onerror=alert(1)>");
  const extra = e.notes.children[1];
  assert.equal(extra.tagName, "details");
  assert.equal(extra.open, undefined);
  assert.equal(extra.children[0].tagName, "summary");
  assert.equal(extra.children[0].textContent, "完整更新说明");
  assert.equal(extra.children[1].textContent, "Longer upgrade details. A continued paragraph.");
  assert.equal(extra.children[2].tagName, "h3");
  assert.equal(extra.children[3].textContent, "More information.");
  assert.equal(e.notes.innerHTML, undefined);
  assert.equal(e.status.dataset.state, "ready");
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

for (const profile of ["home", "tools"]) {
  test(`${profile} shows the explicit GitHub backup only after complete validation`, async () => {
    const manifest = release();
    const backup = githubBackup();
    manifest.downloads["windows-x86_64-installer-github"] = backup;
    const { elements: e } = await run({ profile, manifest });
    assert.equal(e.status.dataset.state, "ready");
    assert.equal(e.installer.href, manifest.platforms["windows-x86_64"].url);
    assert.equal(e["github-backup"].href, backup.url);
    assert.equal(e["github-backup"].hidden, false);
    assert.equal(e["github-backup"].attrs["aria-disabled"], "false");
    assert.equal(e["github-backup"].attrs.tabindex, undefined);
  });
}

for (const [label, mutate] of [
  ["missing URL", (entry) => { delete entry.url; }],
  ["missing name", (entry) => { delete entry.name; }],
  ["missing bytes", (entry) => { delete entry.bytes; }],
  ["missing SHA256", (entry) => { delete entry.sha256; }],
  ["zero bytes", (entry) => { entry.bytes = 0; }],
  ["negative bytes", (entry) => { entry.bytes = -1; }],
  ["fractional bytes", (entry) => { entry.bytes = 1.5; }],
  ["string bytes", (entry) => { entry.bytes = "21746554"; }],
  ["unsafe byte count", (entry) => { entry.bytes = Number.MAX_SAFE_INTEGER + 1; }],
  ["short SHA256", (entry) => { entry.sha256 = "abcd"; }],
  ["nonhex SHA256", (entry) => { entry.sha256 = "z".repeat(64); }],
  ["wrong name", (entry) => { entry.name = "LoliCode-Setup.exe"; }],
  ["foreign origin", (entry) => { entry.url = entry.url.replace("github.com", "example.com"); }],
  ["spoofed GitHub host", (entry) => { entry.url = entry.url.replace("github.com", "github.com.evil.example"); }],
  ["different repository", (entry) => { entry.url = entry.url.replace("LoliCode-Releases", "LoliCode"); }],
  ["different owner", (entry) => { entry.url = entry.url.replace("treasureGrove", "other"); }],
  ["different version", (entry) => { entry.url = entry.url.replaceAll("4.0.16", "4.0.15"); }],
  ["different tag", (entry) => { entry.url = entry.url.replace("lolicode-v4.0.16", "v4.0.16"); }],
  ["unversioned latest", (entry) => { entry.url = entry.url.replace("download/lolicode-v4.0.16", "latest/download"); }],
  ["noncanonical installer", (entry) => { entry.url = entry.url.replace(entry.name, "another.exe"); }],
  ["nested asset", (entry) => { entry.url = entry.url.replace(entry.name, `nested/${entry.name}`); }],
  ["query string", (entry) => { entry.url += "?download=1"; }],
  ["fragment", (entry) => { entry.url += "#download"; }],
  ["userinfo", (entry) => { entry.url = entry.url.replace("https://", "https://user:pass@"); }],
  ["plain HTTP", (entry) => { entry.url = entry.url.replace("https://", "http://"); }],
]) {
  test(`GitHub backup ${label} disables every link atomically`, async () => {
    const manifest = release();
    const backup = githubBackup();
    mutate(backup);
    manifest.downloads["windows-x86_64-installer-github"] = backup;
    assertBlocked((await run({ manifest })).elements);
  });
}

for (const malformed of [null, false, 0, "", []]) {
  test(`present malformed GitHub backup ${JSON.stringify(malformed)} is not treated as absent`, async () => {
    const manifest = release();
    manifest.downloads["windows-x86_64-installer-github"] = malformed;
    assertBlocked((await run({ manifest })).elements);
  });
}

test("a valid backup cannot enable any link when another download is invalid", async () => {
  const manifest = release();
  manifest.downloads["windows-x86_64-installer-github"] = githubBackup();
  manifest.downloads["windows-x86_64-portable"].url = "https://example.com/archive.zip";
  assertBlocked((await run({ manifest })).elements);
});

test("retry clears a previously shown backup when the next manifest omits it", async () => {
  const manifest = release();
  manifest.downloads["windows-x86_64-installer-github"] = githubBackup();
  const { elements: e } = await run({ manifest });
  assert.equal(e["github-backup"].hidden, false);
  delete manifest.downloads["windows-x86_64-installer-github"];
  e.retry.listeners.click();
  await new Promise(setImmediate);
  assert.equal(e.status.dataset.state, "ready");
  assert.equal(e["github-backup"].hidden, true);
  assert.equal(e["github-backup"].href, undefined);
  assert.equal(e["github-backup"].attrs.tabindex, "-1");
});

test("an invalid later backup clears previously usable primary and backup links", async () => {
  const manifest = release();
  manifest.downloads["windows-x86_64-installer-github"] = githubBackup();
  const { elements: e } = await run({ manifest });
  manifest.downloads["windows-x86_64-installer-github"].url += "?changed=1";
  e.retry.listeners.click();
  await new Promise(setImmediate);
  assertBlocked(e);
});

test("new script tolerates old HTML without a GitHub backup element", async () => {
  const manifest = release();
  manifest.downloads["windows-x86_64-installer-github"] = githubBackup();
  const { elements: e } = await run({ manifest, backupElement: false });
  assert.equal(e.status.dataset.state, "ready");
  assert.ok(e.installer.href);
});

function tencentRelease(version = "4.0.16") {
  const manifest = release();
  manifest.version = version;
  const primaryRoot = `https://lolicode.com/downloads/releases/${version}/`;
  const github = githubBackup(version);
  manifest.platforms["windows-x86_64"].url = primaryRoot + github.name;
  manifest.downloads["windows-x86_64-installer-github"] = github;
  const portable = {
    name: "LoliCode-Portable.zip", bytes: 26186973,
    sha256: "1abc2bf82e9295e270486d200d64408ac102ad7468a8484ed2c1c48b3dec3e45",
    url: primaryRoot + "LoliCode-Portable.zip",
  };
  manifest.downloads["windows-x86_64-portable"] = portable;
  for (const [kind, entry] of [["installer", github], ["portable", portable]]) {
    manifest.downloads[`windows-x86_64-${kind}-tencent`] = {
      ...entry, url: `https://lolicode.com/downloads/tencent/${version}/${entry.name}`,
    };
  }
  return manifest;
}

for (const profile of ["home", "tools"]) {
  test(`${profile} offers explicit Tencent choices without replacing auto or GitHub`, async () => {
    const manifest = tencentRelease("4.0.20");
    const { elements: e } = await run({ profile, manifest });
    assert.equal(e.status.dataset.state, "ready");
    assert.equal(e.installer.href, manifest.platforms["windows-x86_64"].url);
    assert.equal(e.portable.href, manifest.downloads["windows-x86_64-portable"].url);
    assert.equal(e["github-backup"].href, manifest.downloads["windows-x86_64-installer-github"].url);
    assert.equal(e["tencent-downloads"].hidden, false);
    for (const kind of ["installer", "portable"]) {
      assert.equal(e[`tencent-${kind}`].href, manifest.downloads[`windows-x86_64-${kind}-tencent`].url);
      assert.equal(e[`tencent-${kind}`].hidden, false);
      assert.equal(e[`tencent-${kind}`].attrs.tabindex, undefined);
    }
  });
}

for (const kind of ["installer", "portable"]) {
  test(`Tencent ${kind} may be offered independently`, async () => {
    const manifest = tencentRelease();
    const other = kind === "installer" ? "portable" : "installer";
    delete manifest.downloads[`windows-x86_64-${other}-tencent`];
    const { elements: e } = await run({ manifest });
    assert.equal(e.status.dataset.state, "ready");
    assert.equal(e["tencent-downloads"].hidden, false);
    assert.equal(e[`tencent-${kind}`].hidden, false);
    assert.equal(e[`tencent-${other}`].hidden, true);
  });

  for (const [label, mutate] of [
    ["missing byte count", (entry) => { delete entry.bytes; }],
    ["zero byte count", (entry) => { entry.bytes = 0; }],
    ["different byte count", (entry) => { entry.bytes += 1; }],
    ["missing SHA256", (entry) => { delete entry.sha256; }],
    ["invalid SHA256", (entry) => { entry.sha256 = "z".repeat(64); }],
    ["different SHA256", (entry) => { entry.sha256 = "0".repeat(64); }],
    ["wrong filename", (entry) => { entry.name = "another.exe"; }],
    ["wrong root path", (entry) => { entry.url = entry.url.replace("/downloads/tencent/", "/downloads/releases/"); }],
    ["wrong version", (entry) => { entry.url = entry.url.replace("4.0.16", "4.0.15"); }],
    ["wrong URL filename", (entry) => { entry.url = entry.url.replace(entry.name, "another.exe"); }],
    ["direct COS origin", (entry) => { entry.url = entry.url.replace("https://lolicode.com", "https://unapproved.cos.example"); }],
    ["spoofed origin", (entry) => { entry.url = entry.url.replace("lolicode.com", "lolicode.com.evil.example"); }],
    ["userinfo", (entry) => { entry.url = entry.url.replace("https://", "https://user:pass@"); }],
    ["explicit port", (entry) => { entry.url = entry.url.replace("lolicode.com/", "lolicode.com:443/"); }],
    ["plain HTTP", (entry) => { entry.url = entry.url.replace("https://", "http://"); }],
    ["query string", (entry) => { entry.url += "?url=https://example.com"; }],
    ["fragment", (entry) => { entry.url += "#download"; }],
  ]) {
    test(`Tencent ${kind} ${label} fails the whole manifest closed`, async () => {
      const manifest = tencentRelease();
      mutate(manifest.downloads[`windows-x86_64-${kind}-tencent`]);
      assertBlocked((await run({ manifest })).elements);
    });
  }

  for (const malformed of [null, false, 0, "", []]) {
    test(`present malformed Tencent ${kind} ${JSON.stringify(malformed)} is rejected`, async () => {
      const manifest = tencentRelease();
      manifest.downloads[`windows-x86_64-${kind}-tencent`] = malformed;
      assertBlocked((await run({ manifest })).elements);
    });
  }
}

test("Tencent installer needs the verified GitHub identity anchor", async () => {
  const manifest = tencentRelease();
  delete manifest.downloads["windows-x86_64-installer-github"];
  assertBlocked((await run({ manifest })).elements);
});

test("Tencent installer cannot accompany a differently named primary executable", async () => {
  const manifest = tencentRelease();
  manifest.platforms["windows-x86_64"].url = `${homeRoot}different.exe`;
  assertBlocked((await run({ manifest })).elements);
});

for (const field of ["name", "bytes", "sha256"]) {
  test(`Tencent portable needs complete original portable ${field}`, async () => {
    const manifest = tencentRelease();
    delete manifest.downloads["windows-x86_64-portable"][field];
    assertBlocked((await run({ manifest })).elements);
  });
}

test("Tencent portable cannot exist without a primary portable artifact", async () => {
  const manifest = tencentRelease();
  delete manifest.downloads["windows-x86_64-portable"];
  assertBlocked((await run({ manifest })).elements);
});

test("Tencent identity comparison treats uppercase SHA256 as the same digest", async () => {
  const manifest = tencentRelease();
  manifest.downloads["windows-x86_64-installer-tencent"].sha256 =
    manifest.downloads["windows-x86_64-installer-tencent"].sha256.toUpperCase();
  assert.equal((await run({ manifest })).elements.status.dataset.state, "ready");
});

test("omitting Tencent fields on refresh clears their previous URLs and hides the row", async () => {
  const manifest = tencentRelease();
  const { elements: e } = await run({ manifest });
  assert.equal(e["tencent-downloads"].hidden, false);
  delete manifest.downloads["windows-x86_64-installer-tencent"];
  delete manifest.downloads["windows-x86_64-portable-tencent"];
  e.retry.listeners.click();
  await new Promise(setImmediate);
  assert.equal(e.status.dataset.state, "ready");
  assert.equal(e["tencent-downloads"].hidden, true);
  for (const id of ["tencent-installer", "tencent-portable"]) {
    assert.equal(e[id].hidden, true);
    assert.equal(e[id].href, undefined);
  }
  assert.ok(e.installer.href);
  assert.ok(e["github-backup"].href);
});

test("bad Tencent metadata on refresh clears all previously usable downloads", async () => {
  const manifest = tencentRelease();
  const { elements: e } = await run({ manifest });
  manifest.downloads["windows-x86_64-portable-tencent"].bytes += 1;
  e.retry.listeners.click();
  await new Promise(setImmediate);
  assertBlocked(e);
});

test("new script tolerates old HTML without the optional Tencent controls", async () => {
  const { elements: e } = await run({ manifest: tencentRelease(), tencentElements: false });
  assert.equal(e.status.dataset.state, "ready");
  assert.ok(e.installer.href);
});


test("independent product version labels and links retain monotonic native update versions", async () => {
  const manifest=release("https://lolicode.com/downloads/releases");
  manifest.version="4.1.0";manifest.productVersion="1.0.0";
  manifest.platforms["windows-x86_64"].url="https://lolicode.com/downloads/releases/1.0.0/LoliCode-1.0.0-Windows-x64-Setup.exe";
  manifest.downloads["windows-x86_64-portable"].url="https://lolicode.com/downloads/releases/1.0.0/LoliCode-Portable.zip";
  manifest.downloads["windows-x86_64-installer-github"]=githubBackup("1.0.0");
  const {elements}=await run({manifest,profile:"home"});
  assert.equal(elements.status.dataset.state,"ready");
  assert.equal(elements.version.textContent,"LoliCode 1.0.0");
  assert.equal(elements.installer.href,manifest.platforms["windows-x86_64"].url);
  manifest.productVersion="1.0.1";
  const bad=await run({manifest,profile:"home"});assertBlocked(bad.elements);
});
