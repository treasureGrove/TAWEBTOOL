import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceDirectory = path.join(repository, "lolicode");
const assetNames = [
  "site.css",
  "downloads.js",
  "motion.js",
  "logo.svg",
  "site-icon.png",
  "site-icon-192.png",
  "site-icon-512.png",
  "favicon-16.png",
  "favicon-32.png",
  "favicon-48.png",
  "favicon.ico",
  "apple-touch-icon.png",
  "maid.png",
  "workbench.jpg",
  "companion.webp",
  "atelier-room.webp",
  "brooch.webp",
  "workbench-cream.jpg",
  "channels-light.jpg",
  "lolicode-tour.mp4",
  "tour-poster.webp",
  "discovery-v1.json",
];
const markerName = ".lolicode-home-build.json";

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Missing source marker: ${label}`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function requireOfficialHomeUrl(source, pattern, attribute, label) {
  const tags = source.match(pattern) || [];
  const values = tags.length === 1
    ? [...tags[0].matchAll(new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, "gi"))]
    : [];
  if (values.length !== 1 || values[0][2] !== "https://lolicode.com/") {
    throw new Error(`Expected exactly one official homepage ${label}`);
  }
}

export function renderHome(source, forumPath = "/all") {
  if (!/^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(forumPath)) {
    throw new Error(
      "Forum path must be a non-root absolute path, for example /all",
    );
  }
  requireOfficialHomeUrl(
    source,
    /<link\b(?=[^>]*\brel\s*=\s*["']canonical["'])[^>]*>/gi,
    "href",
    "canonical",
  );
  requireOfficialHomeUrl(
    source,
    /<meta\b(?=[^>]*\bproperty\s*=\s*["']og:url["'])[^>]*>/gi,
    "content",
    "Open Graph URL",
  );
  let html = replaceRequired(
    source,
    /(<meta\s+name="lolicode-download-profile"\s+content=")tools("\s*\/>)/,
    "$1home$2",
    "download profile",
  );
  html = replaceRequired(
    html,
    /((?:src|href|poster)=")\.\/assets\//g,
    "$1/desktop-assets/",
    "assets",
  );
  html = replaceRequired(
    html,
    /href="https:\/\/lolicode\.com\/all"/g,
    `href="https://lolicode.com${forumPath}"`,
    "community links",
  );
  html = replaceRequired(
    html,
    /<a href="\/">TA 工具箱 ↗<\/a>/,
    '<a href="https://tools.treasuregrove.art/">TA 工具箱 ↗</a>',
    "toolbox link",
  );
  return html;
}

async function requirePlainFile(target) {
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Not a plain source file: ${target}`);
}

export async function buildHome({ outDirectory, forumPath = "/all" }) {
  if (!outDirectory) throw new Error("--out-dir is required");
  const output = path.resolve(outDirectory);
  const relative = path.relative(repository, output);
  if (
    !relative ||
    ["lolicode", "scripts"].includes(relative.split(path.sep)[0])
  ) {
    throw new Error(
      "Output must not overwrite the repository or source directories",
    );
  }
  const catalog = JSON.parse(
    await readFile(
      path.join(sourceDirectory, "assets/discovery-v1.json"),
      "utf8",
    ),
  );
  const previews = catalog.entries
    .filter((entry) => entry.preview)
    .map((entry) => {
      const preview = entry.preview;
      if (
        !/^[a-z0-9-]+$/.test(entry.id) ||
        !/^[a-f0-9]{64}$/.test(preview.sha256) ||
        !["png", "jpg"].some(
          (ext) =>
            preview.filename ===
            `${entry.id}-${preview.sha256.slice(0, 12)}.${ext}`,
        )
      )
        throw new Error("Invalid discovery preview");
      return { name: `rankings/${preview.filename}`, sha256: preview.sha256 };
    });
  const buildAssets = [...assetNames, ...previews.map((entry) => entry.name)];
  const sourceFiles = [
    "index.html",
    "sitemap-desktop.xml",
    ...buildAssets.map((name) => `assets/${name}`),
  ];
  for (const name of sourceFiles)
    await requirePlainFile(path.join(sourceDirectory, name));
  for (const preview of previews) {
    const bytes = await readFile(
      path.join(sourceDirectory, "assets", preview.name),
    );
    if (
      bytes.length > 2 * 1024 * 1024 ||
      createHash("sha256").update(bytes).digest("hex") !== preview.sha256
    )
      throw new Error("Discovery preview checksum mismatch");
  }
  const html = renderHome(
    await readFile(path.join(sourceDirectory, "index.html"), "utf8"),
    forumPath,
  );
  await mkdir(output, { recursive: true });
  if ((await lstat(output)).isSymbolicLink())
    throw new Error("Output must not be a symlink");
  const existing = await readdir(output);
  if (existing.length) {
    let marker;
    try {
      await requirePlainFile(path.join(output, markerName));
      marker = JSON.parse(
        await readFile(path.join(output, markerName), "utf8"),
      );
    } catch {
      throw new Error(
        "Refusing to overwrite a non-empty directory not owned by this builder",
      );
    }
    if (marker.kind !== "lolicode-home-build" || marker.format !== 1) {
      throw new Error("Unrecognized output ownership marker");
    }
  }
  const assets = path.join(output, "desktop-assets");
  await mkdir(assets, { recursive: true });
  if ((await lstat(assets)).isSymbolicLink())
    throw new Error("Assets output must not be a symlink");
  if (previews.length) {
    const directory = path.join(assets, "rankings");
    await mkdir(directory, { recursive: true });
    if ((await lstat(directory)).isSymbolicLink())
      throw new Error("Rankings output must not be a symlink");
  }
  for (const name of buildAssets) {
    const destination = path.join(assets, name);
    try {
      await requirePlainFile(destination);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await copyFile(path.join(sourceDirectory, "assets", name), destination);
  }
  const index = path.join(output, "index.html");
  try {
    await requirePlainFile(index);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(index, html);
  const sitemap = path.join(output, "sitemap-desktop.xml");
  try {
    await requirePlainFile(sitemap);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await copyFile(path.join(sourceDirectory, "sitemap-desktop.xml"), sitemap);
  await writeFile(
    path.join(output, markerName),
    JSON.stringify(
      { kind: "lolicode-home-build", format: 1, forumPath },
      null,
      2,
    ) + "\n",
  );
  return {
    output,
    forumUrl: `https://lolicode.com${forumPath}`,
    files: [
      "index.html",
      "sitemap-desktop.xml",
      ...buildAssets.map((name) => `desktop-assets/${name}`),
    ],
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (
      !["--out-dir", "--forum-path"].includes(key) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    ) {
      throw new Error(
        "Usage: node scripts/build-lolicode-home.mjs --out-dir <directory> [--forum-path /all]",
      );
    }
    if (key === "--out-dir") options.outDirectory = args[i + 1];
    else options.forumPath = args[i + 1];
  }
  console.log(JSON.stringify(await buildHome(options), null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
