import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { renderHome } from "../../scripts/build-lolicode-home.mjs";

const output = new URL("../../tmp/home-community-payload/", import.meta.url);
await mkdir(new URL("site/desktop-assets/", output), { recursive: true });
const html = renderHome(await readFile(new URL("../../lolicode/index.html", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const section = html.match(/        <section id="community"[\s\S]*?<\/section>\n/)[0];
const communityLink = html.match(/          <a class="hero-community-link"[^\n]*\n/)[0];
const stylesheet = '<link rel="stylesheet" href="/desktop-assets/companion-v3-20261119-showcase.css" />';
const motion = '<script src="/desktop-assets/motion.js?v=companion-v3-20261119" defer></script>';
const retry = '<button id="retry" type="button" hidden>重新读取下载信息</button>\n';
const paper = '      <div class="paper">\n';
const edits = [
  [stylesheet, `${stylesheet}\n    <link rel="stylesheet" href="/desktop-assets/home-20261120-cherry.css" />`],
  [motion, `${motion}\n    <script type="module" src="/desktop-assets/home-20261120-community.js"></script>`],
  [retry, retry + communityLink],
  [paper, paper + section],
];
const files = { "homepage-edits.json": Buffer.from(JSON.stringify(edits, null, 2) + "\n") };
for (const name of ["home-20261120-cherry.css", "home-20261120-community.js"]) {
  files[`desktop-assets/${name}`] = await readFile(new URL(`../../lolicode/assets/${name}`, import.meta.url));
}
const sha = (data) => createHash("sha256").update(data).digest("hex");
const manifest = { batch: "20261120-home-cherry-community-v1", files: {} };
for (const [name, data] of Object.entries(files)) {
  await writeFile(new URL(`site/${name}`, output), data);
  manifest.files[name] = sha(data);
}
const raw = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
await writeFile(new URL("manifest.json", output), raw);
console.log(JSON.stringify({ output: output.pathname, manifestSha256: sha(raw), files: Object.keys(files) }));
