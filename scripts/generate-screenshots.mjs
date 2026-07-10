// Generates Heirloom PWA manifest screenshots into /public/screenshots.
// Run: node scripts/generate-screenshots.mjs
//
// Chromium shows a richer, taller install dialog when the manifest advertises
// screenshots (≥1 `wide` for desktop, ≥1 `narrow` for mobile). We render
// lightweight, on-brand mockups from inline SVG with sharp — no external design
// assets and no need to pull real runtime data — so the pitch is representative
// without shipping heavy captures. Sizes/labels here must match app/manifest.ts.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

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

const outDir = join(root, "public", "screenshots");
mkdirSync(outDir, { recursive: true });

// Brand palette (mirrors scripts/generate-icons.mjs + config/brand.ts).
const CREAM = "#fffaf3";
const SURFACE = "#fef3e2";
const AMBER_A = "#c2620a";
const AMBER_B = "#a4490a";
const INK = "#3d2b1f";
const MUTED = "#8a7660";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** A pot-and-sprig glyph tile, scaled/positioned by the caller. */
function logoMark(x, y, size, fill = CREAM) {
  const s = size / 32;
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}">
    <path d="M16 12c0-3 1.6-5.2 4-6.4-.2 2.9-1.3 5-4 6.4Z"/>
    <path d="M6 13h20l-1.5 10.2A4 4 0 0 1 20.5 27h-9a4 4 0 0 1-4-3.8L6 13Z"/>
    <rect x="4.5" y="10.5" width="23" height="3.4" rx="1.7"/>
    <circle cx="4.6" cy="12.2" r="1.9"/><circle cx="27.4" cy="12.2" r="1.9"/>
  </g>`;
}

/** Desktop "Your cookbook" grid. */
function wideSvg(w = 1280, h = 800) {
  const cards = [];
  const cols = 3;
  const gap = 28;
  const padX = 64;
  const gridTop = 208;
  const cardW = (w - padX * 2 - gap * (cols - 1)) / cols;
  const cardH = 300;
  const titles = [
    "Sunday Roast",
    "Nonna's Ragù",
    "Lemon Olive Cake",
    "Weeknight Tacos",
    "Miso Salmon",
    "Apple Galette",
  ];
  const metas = [
    "2 hr · 6 servings",
    "45 min · 4 servings",
    "1 hr · 8 slices",
    "25 min · 4 servings",
    "20 min · 2 servings",
    "1 hr 10 min · 8 slices",
  ];
  for (let i = 0; i < 6; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = padX + col * (cardW + gap);
    const y = gridTop + row * (cardH + gap);
    cards.push(`<g>
      <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="20" fill="${CREAM}" stroke="#ecdcc4"/>
      <rect x="${x}" y="${y}" width="${cardW}" height="180" rx="20" fill="url(#plate)"/>
      <rect x="${x}" y="${y + 160}" width="${cardW}" height="20" fill="${CREAM}"/>
      ${logoMark(x + cardW / 2 - 34, y + 46, 68, "#ffffff")}
      <text x="${x + 24}" y="${y + 234}" font-family="Georgia, serif" font-size="25" font-weight="700" fill="${INK}">${esc(titles[i])}</text>
      <text x="${x + 24}" y="${y + 266}" font-family="system-ui, sans-serif" font-size="16" fill="${MUTED}">${esc(metas[i])}</text>
    </g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${AMBER_A}"/><stop offset="1" stop-color="${AMBER_B}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="${SURFACE}"/>
    <rect width="${w}" height="76" fill="${CREAM}"/>
    ${logoMark(64, 22, 32, AMBER_B)}
    <text x="108" y="50" font-family="Georgia, serif" font-size="26" font-weight="700" fill="${INK}">Heirloom</text>
    <rect x="${w - 196}" y="24" width="132" height="30" rx="15" fill="url(#plate)"/>
    <text x="${w - 130}" y="44" text-anchor="middle" font-family="system-ui, sans-serif" font-size="15" fill="${CREAM}">New recipe</text>
    <text x="64" y="150" font-family="Georgia, serif" font-size="40" font-weight="700" fill="${INK}">Your cookbook</text>
    <text x="64" y="182" font-family="system-ui, sans-serif" font-size="18" fill="${MUTED}">Family recipes, kept alive.</text>
    ${cards.join("\n")}
  </svg>`;
}

/** Mobile Cook Mode step. */
function narrowSvg(w = 800, h = 1280) {
  const pad = 44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a1c12"/><stop offset="1" stop-color="#1c130c"/>
      </linearGradient>
      <linearGradient id="plate2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${AMBER_A}"/><stop offset="1" stop-color="${AMBER_B}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect x="${pad}" y="70" width="${w - pad * 2}" height="10" rx="5" fill="#4a3826"/>
    <rect x="${pad}" y="70" width="${(w - pad * 2) * 0.45}" height="10" rx="5" fill="url(#plate2)"/>
    <text x="${pad}" y="150" font-family="system-ui, sans-serif" font-size="22" fill="${MUTED}">Step 3 of 7</text>
    <rect x="${pad}" y="180" width="${w - pad * 2}" height="360" rx="28" fill="url(#plate2)"/>
    ${logoMark(w / 2 - 60, 300, 120, "#ffffff")}
    <text x="${pad}" y="620" font-family="Georgia, serif" font-size="40" font-weight="700" fill="${CREAM}">Simmer the sauce</text>
    <text x="${pad}" y="672" font-family="system-ui, sans-serif" font-size="24" fill="#d9c9b6">Stir gently and let it reduce until</text>
    <text x="${pad}" y="706" font-family="system-ui, sans-serif" font-size="24" fill="#d9c9b6">it coats the back of a spoon.</text>
    <circle cx="${w / 2}" cy="900" r="120" fill="none" stroke="#4a3826" stroke-width="14"/>
    <circle cx="${w / 2}" cy="900" r="120" fill="none" stroke="url(#plate2)" stroke-width="14" stroke-dasharray="540 754" stroke-linecap="round" transform="rotate(-90 ${w / 2} 900)"/>
    <text x="${w / 2}" y="912" text-anchor="middle" font-family="system-ui, sans-serif" font-size="52" font-weight="700" fill="${CREAM}">8:30</text>
    <rect x="${pad}" y="1090" width="${(w - pad * 2 - 24) / 2}" height="96" rx="24" fill="#3a2a1c"/>
    <rect x="${w / 2 + 12}" y="1090" width="${(w - pad * 2 - 24) / 2}" height="96" rx="24" fill="url(#plate2)"/>
    <text x="${w * 0.31}" y="1148" text-anchor="middle" font-family="system-ui, sans-serif" font-size="26" fill="${CREAM}">Back</text>
    <text x="${w * 0.69}" y="1148" text-anchor="middle" font-family="system-ui, sans-serif" font-size="26" fill="${CREAM}">Next step</text>
  </svg>`;
}

async function emit(name, svg) {
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(join(outDir, name));
  console.log("wrote", name);
}

await emit("cookbook-wide.png", wideSvg());
await emit("cook-mode-narrow.png", narrowSvg());
console.log("done");
