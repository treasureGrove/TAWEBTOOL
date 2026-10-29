/**
 * Export the website icons from LoliCode's canonical native App icon.
 *
 * Requires sharp. If it is not installed in the project, set SHARP_MODULE to
 * the absolute path of an installed sharp entry point before running:
 *   node scripts/export-lolicode-site-icon.mjs [path/to/TAI-Switch]
 *
 * The ICO and 512px PNG are copied byte-for-byte from the native App assets.
 * Keep portrait/background edits in the App master only, so all entrances
 * receive the same artwork, wine-red backdrop and transparent outer corners.
 * The 16/32/48px PNGs are extracted without re-encoding from that ICO.
 * Only the Apple 180px and web 192px sizes require resizing.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { default: sharp } = await import(
  process.env.SHARP_MODULE
    ? pathToFileURL(path.resolve(process.env.SHARP_MODULE)).href
    : "sharp"
);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "lolicode", "assets");
const appRoot = path.resolve(process.argv[2] || path.join(root, "..", "TAI-Switch"));
const appIcons = path.join(appRoot, "src-tauri", "icons");
const config = JSON.parse(
  await fs.readFile(path.join(appRoot, "src-tauri", "tauri.conf.json"), "utf8"),
);
if (!config.bundle.icon.includes("icons/icon.ico")) {
  throw new Error("The native App configuration no longer references icons/icon.ico");
}
const source = await fs.readFile(path.join(appIcons, "icon.png"));
const metadata = await sharp(source).metadata();
if (metadata.width !== 512 || metadata.height !== 512) {
  throw new Error("Expected the current native App icon to be 512×512");
}
await fs.writeFile(path.join(assets, "site-icon.png"), source);
await fs.writeFile(path.join(assets, "site-icon-512.png"), source);

const exports = [
  ["apple-touch-icon.png", 180],
  ["site-icon-192.png", 192],
];
for (const [name, size] of exports) {
  const png = await sharp(source)
    .resize(size, size, { kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  await fs.writeFile(path.join(assets, name), png);
}

const ico = await fs.readFile(path.join(appIcons, "icon.ico"));
if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
  throw new Error("Invalid original App ICO");
}
const expectedSizes = new Set([16, 32, 48]);
for (let index = 0; index < ico.readUInt16LE(4); index++) {
  const entry = 6 + index * 16;
  const size = ico.readUInt8(entry) || 256;
  if (!expectedSizes.has(size)) continue;
  const length = ico.readUInt32LE(entry + 8);
  const offset = ico.readUInt32LE(entry + 12);
  const png = ico.subarray(offset, offset + length);
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`Original ${size}px ICO frame is not PNG; preserve it with an ICO decoder`);
  }
  await fs.writeFile(path.join(assets, `favicon-${size}.png`), png);
  expectedSizes.delete(size);
}
if (expectedSizes.size) throw new Error("Original App ICO is missing a required size");
await fs.writeFile(path.join(assets, "favicon.ico"), ico);
console.log("Exported 8 website icon assets from the canonical native LoliCode App icon");
