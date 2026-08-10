// Generates Heirloom browser, PWA, and iOS icons.
// Run: node scripts/generate-icons.mjs
// Uses sharp to rasterize the potted plant from src/components/layout/logo.tsx
// so installed-app surfaces carry the same mark as the site.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// sharp may be pnpm-nested, try the normal resolve then the store path.
let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = require(join(root, 'node_modules/.pnpm/node_modules/sharp'));
}

const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BACKGROUND = '#fffaf3';
const POT = '#b4552d';
const LEAF = '#5d764c';
const RIM = '#f28c18';

function markSvg({ x, y, size }) {
  const scale = size / 32;

  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <path d="M16 12c0-3 1.6-5.2 4-6.4-.2 2.9-1.3 5-4 6.4Z" fill="${LEAF}"/>
    <path d="M16 12c0-2.6-1.4-4.6-3.8-5.7.1 2.6 1.2 4.5 3.8 5.7Z" fill="${LEAF}" fill-opacity=".7"/>
    <path d="M6 13h20l-1.5 10.2A4 4 0 0 1 20.5 27h-9a4 4 0 0 1-4-3.8L6 13Z" fill="${POT}"/>
    <rect x="4.5" y="10.5" width="23" height="3.4" rx="1.7" fill="${RIM}"/>
    <circle cx="4.6" cy="12.2" r="1.9" fill="${RIM}"/>
    <circle cx="27.4" cy="12.2" r="1.9" fill="${RIM}"/>
  </g>`;
}

function svg({ size = 512, mark = 260, radius = 112, bleed = false } = {}) {
  const offset = (size - mark) / 2;
  const rect = bleed
    ? `<rect width="${size}" height="${size}" fill="${BACKGROUND}"/>`
    : `<rect width="${size}" height="${size}" rx="${radius}" fill="${BACKGROUND}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${rect}
  ${markSvg({ x: offset, y: offset, size: mark })}
</svg>`;
}

async function emit(name, opts) {
  const buf = Buffer.from(svg(opts));
  await sharp(buf).png().toFile(join(outDir, name));
  console.log('wrote', name);
}

async function emitFavicon() {
  const png = await sharp(Buffer.from(svg({ size: 64, mark: 48, radius: 12 })))
    .resize(32, 32)
    .png()
    .toBuffer();
  const header = Buffer.alloc(22);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(32, 6);
  header.writeUInt8(32, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);

  writeFileSync(join(root, 'public', 'favicon.ico'), Buffer.concat([header, png]));
  console.log('wrote favicon.ico');
}

// --- iOS launch splash screens (#187) -------------------------------------
// Flat launch screen matching the app's initial paint (brand cream) with the
// centered brand mark, so an installed iOS app shows a branded splash instead
// of a blank white flash. One image per device × orientation.

function splashSvg(width, height) {
  const min = Math.min(width, height);
  const mark = Math.round(min * 0.3);
  const offX = (width - mark) / 2;
  const offY = (height - mark) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${BACKGROUND}"/>
  ${markSvg({ x: offX, y: offY, size: mark })}
</svg>`;
}

// Filename + pixel formulas MUST match src/config/ios-splash.ts.
function splashFileName(device, orientation) {
  return `apple-splash-${device.w}-${device.h}-${device.dpr}x-${orientation}.png`;
}

function splashPixels(device, orientation) {
  const long = device.h * device.dpr;
  const short = device.w * device.dpr;
  return orientation === 'portrait'
    ? { width: short, height: long }
    : { width: long, height: short };
}

async function emitSplash(device, orientation) {
  const { width, height } = splashPixels(device, orientation);
  const buf = Buffer.from(splashSvg(width, height));
  const name = splashFileName(device, orientation);
  await sharp(buf).png({ palette: true }).toFile(join(outDir, name));
  console.log('wrote', name, `(${width}x${height})`);
}

await emit('icon-192.png', { size: 192, mark: 100, radius: 42 });
await emit('icon-512.png', { size: 512, mark: 260, radius: 112 });
await emit('icon-maskable-512.png', {
  size: 512,
  mark: 200,
  radius: 0,
  bleed: true,
});
// Opaque, full-bleed home-screen glyph for iOS (it applies its own rounding).
await emit('apple-touch-icon.png', {
  size: 180,
  mark: 96,
  radius: 0,
  bleed: true,
});
await emitFavicon();

const splashDevices = JSON.parse(
  readFileSync(join(root, 'src/config/ios-splash-devices.json'), 'utf8'),
);
for (const device of splashDevices) {
  await emitSplash(device, 'portrait');
  await emitSplash(device, 'landscape');
}
console.log('done');
