import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { renderHome } from "../../scripts/build-lolicode-home.mjs";

const liveFile = process.argv[2];
if (!liveFile) throw new Error("Provide the previous production homepage.");

const batch = "20261120-home-product-v4";
const priorHome =
  "258c2cd5c2bf84af9bbf791de6ea159c3a2bacd556797075e22a8bd9c4b2cf22";
const priorSnippet =
  "2b5b09041274e0477e95d13790ae991dc0695a38ccfab8816a42a74ad7c86354";
const css = "home-20261120-product.css";
const module = "home-20261120-product.js";
const cliArtifact = "/cli/downloads/lolicode-cli-0.1.0-alpha.3.tgz";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const live = await readFile(liveFile);
if (sha256(live) !== priorHome) throw new Error("Production homepage changed.");
const before = live.toString("utf8").replaceAll("\r\n", "\n");
const source = await readFile(
  new URL("../../lolicode/index.html", import.meta.url),
  "utf8",
);
const after = renderHome(source).replaceAll("\r\n", "\n");
const gallery = '        <section id="workspace-gallery"';
const closing =
  '        <section\n          class="closing-section page-width"';

function between(html, start, end) {
  if (html.split(start).length !== 2 || html.split(end).length !== 2)
    throw new Error("Expected unique homepage section markers.");
  const first = html.indexOf(start);
  const last = html.indexOf(end);
  if (last <= first) throw new Error("Homepage section order changed.");
  return html.slice(first, last);
}

const edits = [
  [
    '    <link rel="stylesheet" href="/desktop-assets/home-20261120-portal.css" />\n',
    between(
      after,
      '    <link rel="stylesheet" href="/desktop-assets/' + css,
      '    <script src="/desktop-assets/downloads.js?',
    ),
  ],
  [
    '<meta name="theme-color" content="#9e2445" />',
    '<meta name="theme-color" content="#751b35" />',
  ],
  ['  <body class="community-home">', '  <body class="product-home">'],
  [
    between(before, '    <header class="home-rail"', gallery),
    between(after, '    <header class="product-header"', gallery),
  ],
  [
    closing,
    between(after, '        <section id="community"', closing) + closing,
  ],
];

let candidate = before;
for (const [marker, replacement] of edits) {
  if (candidate.split(marker).length !== 2)
    throw new Error("Expected one homepage edit marker.");
  candidate = candidate.replace(marker, () => replacement);
}
const sections = [
  "download",
  "terminal-install",
  "film",
  "workspace-gallery",
  "guides-title",
  "community",
];
const positions = sections.map((id) => candidate.indexOf('id="' + id + '"'));
if (
  positions.some(
    (position, index) =>
      position < 0 || (index > 0 && position <= positions[index - 1]),
  )
)
  throw new Error(
    "Expected download, CLI, demo, gallery, guides and community in order.",
  );
for (const marker of [
  "/desktop-assets/" + module,
  'id="installer"',
  "https://lolicode.com" + cliArtifact,
]) {
  if (!candidate.includes(marker))
    throw new Error("Missing homepage entry: " + marker);
}

// Apply the deployment template to this batch's baseline and two exact asset routes.
let deployment = (
  await readFile(new URL("../home-atelier/deploy.py", import.meta.url), "utf8")
).replaceAll("\r\n", "\n");
const normalizeMarkers = [
  '        marker = marker.replace("\\n", newline)',
  '        replacement = replacement.replace("\\n", newline)',
  "        after = replace_once(after, marker.encode(), replacement.encode())",
].join("\n");
const mixedLineEndings = [
  '        pattern = rb"\\r?\\n".join(re.escape(part) for part in marker.encode().split(b"\\n"))',
  "        matches = list(re.finditer(pattern, after))",
  '        require(len(matches) == 1, "Expected one homepage edit marker")',
  "        start, end = matches[0].span()",
  '        after = after[:start] + replacement.replace("\\n", newline).encode() + after[end:]',
].join("\n");
const updates = [
  ["20261120-home-atelier-v2", batch],
  [
    "lolicode-home-atelier-preview-20261120.conf",
    "lolicode-home-product-preview-20261120.conf",
  ],
  [
    "e42acc23f4a88f1c10e80dbd3c59d4d3a4258586d8a015651fb42a72cecb0bdc",
    priorSnippet,
  ],
  [
    'ASSETS = {"desktop-assets/home-20261120-atelier.css"}',
    'ASSETS = {"desktop-assets/' + css + '", "desktop-assets/' + module + '"}',
  ],
  [
    'require(b"/desktop-assets/home-20261120-atelier.css" not in before, "Refresh already configured")',
    'require(all(("/" + name).encode() not in before for name in ASSETS), "Refresh already configured")',
  ],
  [
    "location = /desktop-assets/home-20261120-atelier.css",
    "location = /{name}",
  ],
  ["    assets = f", '    assets = b"".join(f'],
  [
    "'''.encode()\n    return replace_once(before, block, changed) + assets",
    "'''.encode() for name in sorted(ASSETS))\n    return replace_once(before, block, changed) + assets",
  ],
  [
    'require(len(edits) == 4, "Expected four homepage insertions")',
    'require(len(edits) == 5, "Expected five homepage edits")',
  ],
  [normalizeMarkers, mixedLineEndings],
  [
    "    baseline = {**actual",
    '    require(sha(original) == "' +
      priorHome +
      '", "Production homepage changed")\n    baseline = {**actual',
  ],
  [
    'PRESERVED = ("/cli/", "/cli/latest.json",',
    'PRESERVED = ("/cli/", "/cli/latest.json", "' + cliArtifact + '",',
  ],
];
for (const [marker, replacement] of updates) {
  if (deployment.split(marker).length !== 2)
    throw new Error("The deployment template changed at " + marker);
  deployment = deployment.replace(marker, () => replacement);
}

const output = new URL("../../tmp/home-product-payload/", import.meta.url);
await mkdir(new URL("site/desktop-assets/", output), { recursive: true });
const files = {
  "homepage-edits.json": Buffer.from(JSON.stringify(edits, null, 2) + "\n"),
};
for (const name of [css, module]) {
  files["desktop-assets/" + name] = await readFile(
    new URL("../../lolicode/assets/" + name, import.meta.url),
  );
}
const manifest = { batch, files: {} };
for (const [name, bytes] of Object.entries(files)) {
  manifest.files[name] = sha256(bytes);
  await writeFile(new URL("site/" + name, output), bytes);
}
const raw = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
await writeFile(new URL("manifest.json", output), raw);
await writeFile(new URL("deploy.py", output), deployment);
console.log(JSON.stringify({ batch, manifestSha256: sha256(raw) }));
