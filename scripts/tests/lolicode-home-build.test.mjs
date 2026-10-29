import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildHome, renderHome } from "../build-lolicode-home.mjs";

const source = await readFile(
  new URL("../../lolicode/index.html", import.meta.url),
  "utf8",
);
async function tempDirectory(run) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "lolicode-home-test-"),
  );
  try {
    return await run(directory);
  } finally {
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("lolicode-home-test-"));
    await rm(directory, { recursive: true, force: true });
  }
}

test("home HTML is derived without changing the tools source", () => {
  const html = renderHome(source);
  assert.match(html, /name="lolicode-download-profile" content="home"/);
  assert.match(html, /rel="canonical" href="https:\/\/lolicode\.com\/"/);
  assert.match(html, /property="og:url"\s+content="https:\/\/lolicode\.com\/"/);
  assert.equal(
    (html.match(/href="https:\/\/lolicode\.com\/all"/g) || []).length,
    3,
  );
  assert.ok(!html.includes('src="./assets/'));
  assert.match(html, /poster="\/desktop-assets\/tour-poster\.webp\?/);
  assert.match(html, /src="\/desktop-assets\/lolicode-tour\.mp4\?/);
  assert.match(html, /src="\/desktop-assets\/downloads\.js\?/);
  assert.match(html, /href="https:\/\/tools\.treasuregrove\.art\/">TA 工具箱/);
  assert.match(source, /content="tools"/);
  assert.equal(
    (source.match(/href="https:\/\/lolicode\.com\/all"/g) || []).length,
    3,
  );
  assert.ok(!source.includes('href="https://lolicode.com"'));
  assert.match(
    source,
    /rel="canonical" href="https:\/\/lolicode\.com\/"/,
  );
  assert.match(source, /property="og:url"\s+content="https:\/\/lolicode\.com\/"/);
});
test("community path is configurable while external and root paths are rejected", () => {
  assert.match(
    renderHome(source, "/community"),
    /href="https:\/\/lolicode\.com\/community"/,
  );
  for (const forumPath of [
    "/",
    "//evil.example",
    "https://evil.example",
    "/all?next=x",
    '/all" onload="x',
  ]) {
    assert.throws(() => renderHome(source, forumPath), /Forum path/);
  }
});
test("missing source markers stop a build instead of silently producing a broken home", () => {
  assert.throws(
    () =>
      renderHome(
        source.replace('name="lolicode-download-profile"', 'name="missing"'),
      ),
    /Missing source marker/,
  );
  const canonical = '<link rel="canonical" href="https://lolicode.com/" />';
  for (const invalid of [
    source.replace(canonical, ""),
    source.replace(canonical, '<link rel="canonical" href="https://tools.treasuregrove.art/lolicode/" />'),
    source.replace(canonical, canonical + canonical),
    source.replace(canonical, '<link rel="canonical" href="https://lolicode.com/" href="https://example.com/" />'),
  ]) {
    assert.throws(() => renderHome(invalid), /official homepage canonical/);
  }
  for (const invalid of [
    source.replace('property="og:url"', 'property="missing"'),
    source.replace(/(property="og:url"\s+content=")https:\/\/lolicode\.com\//, '$1https://example.com/'),
  ]) {
    assert.throws(() => renderHome(invalid), /official homepage Open Graph URL/);
  }
});
test("builder emits only the homepage assets and can refresh its own directory", async () => {
  await tempDirectory(async (directory) => {
    const result = await buildHome({ outDirectory: directory });
    assert.equal(result.files.length, 27);
    assert.deepEqual((await readdir(directory)).sort(), [
      ".lolicode-home-build.json",
      "desktop-assets",
      "index.html",
      "sitemap-desktop.xml",
    ]);
    assert.deepEqual(
      (await readdir(path.join(directory, "desktop-assets"))).sort(),
      [
        "apple-touch-icon.png",
        "atelier-room.webp",
        "brooch.webp",
        "channels-light.jpg",
        "companion.webp",
        "discovery-v1.json",
        "downloads.js",
        "favicon-16.png",
        "favicon-32.png",
        "favicon-48.png",
        "favicon.ico",
        "logo.svg",
        "lolicode-tour.mp4",
        "maid.png",
        "motion.js",
        "rankings",
        "site-icon-192.png",
        "site-icon-512.png",
        "site-icon.png",
        "site.css",
        "tour-poster.webp",
        "workbench-cream.jpg",
        "workbench.jpg",
      ],
    );
    assert.match(
      await readFile(path.join(directory, "sitemap-desktop.xml"), "utf8"),
      /<loc>https:\/\/lolicode\.com\/<\/loc>/,
    );
    const catalog = JSON.parse(
      await readFile(
        path.join(directory, "desktop-assets/discovery-v1.json"),
        "utf8",
      ),
    );
    const previews = catalog.entries.filter((entry) => entry.preview);
    assert.equal(previews.length, 3);
    for (const entry of previews) {
      assert.ok(
        (
          await readFile(
            path.join(
              directory,
              "desktop-assets/rankings",
              entry.preview.filename,
            ),
          )
        ).length > 1000,
      );
    }
    await buildHome({ outDirectory: directory, forumPath: "/community" });
    assert.match(
      await readFile(path.join(directory, "index.html"), "utf8"),
      /href="https:\/\/lolicode\.com\/community"/,
    );
  });
});
test("builder refuses a non-empty unowned output and preserves its contents", async () => {
  await tempDirectory(async (directory) => {
    await writeFile(path.join(directory, "keep.txt"), "untouched");
    await assert.rejects(
      () => buildHome({ outDirectory: directory }),
      /Refusing to overwrite/,
    );
    assert.equal(
      await readFile(path.join(directory, "keep.txt"), "utf8"),
      "untouched",
    );
  });
});
test("source directories cannot be selected as output", async () => {
  await assert.rejects(
    () =>
      buildHome({
        outDirectory: fileURLToPath(new URL("../../lolicode", import.meta.url)),
      }),
    /Output must not overwrite/,
  );
});
