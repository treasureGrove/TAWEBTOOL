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
    /rel="canonical" href="https:\/\/tools\.treasuregrove\.art\/lolicode\/"/,
  );
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
});
test("builder emits only the homepage assets and can refresh its own directory", async () => {
  await tempDirectory(async (directory) => {
    const result = await buildHome({ outDirectory: directory });
    assert.equal(result.files.length, 7);
    assert.deepEqual((await readdir(directory)).sort(), [
      ".lolicode-home-build.json",
      "desktop-assets",
      "index.html",
    ]);
    assert.deepEqual(
      (await readdir(path.join(directory, "desktop-assets"))).sort(),
      ["downloads.js", "logo.svg", "maid.png", "motion.js", "site.css", "workbench.jpg"],
    );
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
