import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { renderHome } from "../../scripts/build-lolicode-home.mjs";

const liveFile = process.argv[2];
if (!liveFile)
  throw new Error("Provide the previous production homepage HTML file.");
const batch = "20261120-home-community-portal-v3";
const asset = "desktop-assets/home-20261120-portal.css";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const live = await readFile(liveFile);
if (
  sha256(live) !==
  "a95cdb99d2f3582687816365318ca36d8c2208d93af1089d563e13c25ebc7bdf"
)
  throw new Error(
    "The previous production homepage no longer matches this release.",
  );
const before = live.toString("utf8").replaceAll("\r\n", "\n");
const source = await readFile(
  new URL("../../lolicode/index.html", import.meta.url),
  "utf8",
);
const after = renderHome(source).replaceAll("\r\n", "\n");
const end = '        <section id="workspace-gallery"';
function topOfPage(html, start) {
  const first = html.indexOf(start);
  const last = html.indexOf(end);
  if (first < 0 || last <= first || html.indexOf(end, last + end.length) !== -1)
    throw new Error("Cannot locate the homepage layout safely.");
  return html.slice(first, last);
}
const edits = [
  [
    '    <link rel="stylesheet" href="/desktop-assets/home-20261120-cherry.css" />\n',
    "",
  ],
  [
    '    <link rel="stylesheet" href="/desktop-assets/home-20261120-atelier.css" />\n',
    `    <link rel="stylesheet" href="/${asset}" />\n`,
  ],
  ["  <body>", '  <body class="community-home">'],
  [topOfPage(before, "    <header"), topOfPage(after, "    <header")],
];
let candidate = before;
for (const [marker, replacement] of edits) {
  if (candidate.split(marker).length !== 2)
    throw new Error("Expected one homepage edit marker.");
  candidate = candidate.replace(marker, () => replacement);
}
for (const marker of [
  'id="guides-title"',
  'id="product-film"',
  'id="installer"',
  'href="https://lolicode.com/cli/"',
]) {
  if (!candidate.includes(marker))
    throw new Error(`Missing homepage entry: ${marker}`);
}

const output = new URL("../../tmp/home-portal-payload/", import.meta.url);
await mkdir(new URL("site/desktop-assets/", output), { recursive: true });
const files = {
  "homepage-edits.json": Buffer.from(`${JSON.stringify(edits, null, 2)}\n`),
  [asset]: await readFile(
    new URL("../../lolicode/assets/home-20261120-portal.css", import.meta.url),
  ),
};
const manifest = { batch, files: {} };
for (const [name, bytes] of Object.entries(files)) {
  manifest.files[name] = sha256(bytes);
  await writeFile(new URL(`site/${name}`, output), bytes);
}
const raw = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(new URL("manifest.json", output), raw);

// Reuse the verified static preview, switch and rollback procedure for this release.
let deployment = await readFile(
  new URL("../home-atelier/deploy.py", import.meta.url),
  "utf8",
);
const normalizeMarkers =
  '        marker = marker.replace("\\n", newline)\n' +
  '        replacement = replacement.replace("\\n", newline)\n' +
  "        after = replace_once(after, marker.encode(), replacement.encode())";
if (!deployment.includes(normalizeMarkers))
  throw new Error("The deployment template changed.");
deployment = deployment
  .replaceAll("20261120-home-atelier-v2", batch)
  .replaceAll(
    "lolicode-home-atelier-preview-20261120.conf",
    "lolicode-home-portal-preview-20261120.conf",
  )
  .replaceAll("home-20261120-atelier.css", "home-20261120-portal.css")
  .replace(
    "e42acc23f4a88f1c10e80dbd3c59d4d3a4258586d8a015651fb42a72cecb0bdc",
    "adad0e8d30c430507749da83e735490065a97f3973885453663eb380483ad552",
  )
  .replace("Expected four homepage insertions", "Expected four homepage edits")
  .replace(normalizeMarkers, () =>
    [
      '        pattern = rb"\\r?\\n".join(re.escape(part) for part in marker.encode().split(b"\\n"))',
      "        matches = list(re.finditer(pattern, after))",
      '        require(len(matches) == 1, "Expected one homepage edit marker")',
      "        start, end = matches[0].span()",
      '        after = after[:start] + replacement.replace("\\n", newline).encode() + after[end:]',
    ].join("\n"),
  );
await writeFile(new URL("deploy.py", output), deployment);
console.log(JSON.stringify({ batch, manifestSha256: sha256(raw) }));
