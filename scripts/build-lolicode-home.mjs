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
  "maid.png",
  "workbench.jpg",
];
const markerName = ".lolicode-home-build.json";

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Missing source marker: ${label}`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

export function renderHome(source, forumPath = "/all") {
  if (!/^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(forumPath)) {
    throw new Error(
      "Forum path must be a non-root absolute path, for example /all",
    );
  }
  let html = replaceRequired(
    source,
    /(<meta\s+name="lolicode-download-profile"\s+content=")tools("\s*\/>)/,
    "$1home$2",
    "download profile",
  );
  html = replaceRequired(
    html,
    /(<link\s+rel="canonical"\s+href=")https:\/\/tools\.treasuregrove\.art\/lolicode\/("\s*\/>)/,
    "$1https://lolicode.com/$2",
    "canonical",
  );
  html = replaceRequired(
    html,
    /(<meta\s+property="og:url"\s+content=")https:\/\/tools\.treasuregrove\.art\/lolicode\/("\s*\/>)/,
    "$1https://lolicode.com/$2",
    "Open Graph URL",
  );
  html = replaceRequired(
    html,
    /((?:src|href)=")\.\/assets\//g,
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
  const sourceFiles = [
    "index.html",
    ...assetNames.map((name) => `assets/${name}`),
  ];
  for (const name of sourceFiles)
    await requirePlainFile(path.join(sourceDirectory, name));
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
  for (const name of assetNames) {
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
      ...assetNames.map((name) => `desktop-assets/${name}`),
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
