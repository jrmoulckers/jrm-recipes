// Generates Heirloom PWA icons into /public/icons.
// Run: node scripts/generate-icons.mjs
// Uses sharp to rasterize a simple on-brand vector mark (a cream heart on a
// warm plate) so there are no external design dependencies.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// sharp may be pnpm-nested; try the normal resolve then the store path.
let sharp;
try {
  sharp = require("sharp");
} catch {
  sharp = require(join(root, "node_modules/.pnpm/node_modules/sharp"));
}

const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const AMBER_A = "#c2620a";
const AMBER_B = "#a4490a";
const CREAM = "#fff7ec";

// lucide "heart" path, filled.
const HEART =
  "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z";

function svg({ size = 512, mark = 260, radius = 112, bleed = false } = {}) {
  const s = mark / 24;
  const offset = (size - mark) / 2;
  const plateR = mark * 0.62;
  const rect = bleed
    ? `<rect width="${size}" height="${size}" fill="url(#g)"/>`
    : `<rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${AMBER_A}"/>
      <stop offset="1" stop-color="${AMBER_B}"/>
    </linearGradient>
  </defs>
  ${rect}
  <circle cx="${size / 2}" cy="${size / 2}" r="${plateR}" fill="none" stroke="${CREAM}" stroke-opacity="0.22" stroke-width="${size * 0.02}"/>
  <g transform="translate(${offset} ${offset}) scale(${s})">
    <path d="${HEART}" fill="${CREAM}"/>
  </g>
</svg>`;
}

async function emit(name, opts) {
  const buf = Buffer.from(svg(opts));
  await sharp(buf).png().toFile(join(outDir, name));
  console.log("wrote", name);
}

// --- iOS launch splash screens (#187) -------------------------------------
// Flat launch screen matching the app's initial paint (brand cream) with the
// centered brand mark in amber, so an installed iOS app shows a branded splash
// instead of a blank white flash. One image per device × orientation.
const SPLASH_BG = "#fffaf3"; // brand.backgroundColor — matches manifest + body
const AMBER = "#b45309"; // brand.themeColor

function splashSvg(width, height) {
  const min = Math.min(width, height);
  const mark = Math.round(min * 0.3);
  const s = mark / 24;
  const cx = width / 2;
  const cy = height / 2;
  const offX = cx - mark / 2;
  const offY = cy - mark / 2;
  const plateR = mark * 0.62;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${SPLASH_BG}"/>
  <circle cx="${cx}" cy="${cy}" r="${plateR}" fill="none" stroke="${AMBER}" stroke-opacity="0.18" stroke-width="${min * 0.012}"/>
  <g transform="translate(${offX} ${offY}) scale(${s})">
    <path d="${HEART}" fill="${AMBER}"/>
  </g>
</svg>`;
}

// Filename + pixel formulas MUST match src/config/ios-splash.ts.
function splashFileName(device, orientation) {
  return `apple-splash-${device.w}-${device.h}-${device.dpr}x-${orientation}.png`;
}

function splashPixels(device, orientation) {
  const long = device.h * device.dpr;
  const short = device.w * device.dpr;
  return orientation === "portrait"
    ? { width: short, height: long }
    : { width: long, height: short };
}

async function emitSplash(device, orientation) {
  const { width, height } = splashPixels(device, orientation);
  const buf = Buffer.from(splashSvg(width, height));
  const name = splashFileName(device, orientation);
  await sharp(buf).png({ palette: true }).toFile(join(outDir, name));
  console.log("wrote", name, `(${width}x${height})`);
}

await emit("icon-192.png", { size: 192, mark: 100, radius: 42 });
await emit("icon-512.png", { size: 512, mark: 260, radius: 112 });
await emit("icon-maskable-512.png", { size: 512, mark: 200, radius: 0, bleed: true });
// Opaque, full-bleed home-screen glyph for iOS (it applies its own rounding).
await emit("apple-touch-icon.png", { size: 180, mark: 96, radius: 0, bleed: true });

const splashDevices = JSON.parse(
  readFileSync(join(root, "src/config/ios-splash-devices.json"), "utf8"),
);
for (const device of splashDevices) {
  await emitSplash(device, "portrait");
  await emitSplash(device, "landscape");
}
console.log("done");
