import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { UI_THEME_IDS } from "~/config/themes";

/**
 * WCAG contrast regression guard for the design tokens (issue #132).
 *
 * Parses the raw HSL channels from themes.css, resolves every semantic token for
 * all registered UI modes × light/dark (matching the real CSS cascade — kitchen
 * is defined on :root and every other mode overrides it), and asserts the core
 * pairs meet AA. A new sub-AA mode (or a regressing nudge) fails here.
 *
 * Contrast matrix (verified green): every pair below meets its threshold across
 * all 10 theme×scheme combinations — text pairs ≥ 4.5:1 (1.4.3), UI pairs
 * ≥ 3:1 (1.4.11). See the pair lists for exactly what is guarded.
 */

const css = readFileSync(join(process.cwd(), "src/styles/themes.css"), "utf8");

const HSL_RE = /^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/;

function hslToRgb(value: string): [number, number, number] {
  const m = HSL_RE.exec(value.trim());
  if (!m) throw new Error(`Unparseable HSL token: "${value}"`);
  const [, hRaw, sRaw, lRaw] = m;
  if (hRaw === undefined || sRaw === undefined || lRaw === undefined) {
    throw new Error(`Unparseable HSL token: "${value}"`);
  }
  const h = parseFloat(hRaw) / 360;
  const s = parseFloat(sRaw) / 100;
  const l = parseFloat(lRaw) / 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

function relativeLuminance([r, g, b]: [number, number, number]) {
  const f = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string) {
  const la = relativeLuminance(hslToRgb(a));
  const lb = relativeLuminance(hslToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

type Block = { selector: string; tokens: Record<string, string> };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const blockRe = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text))) {
    const selector = m[1];
    const body = m[2];
    if (selector === undefined || body === undefined) continue;
    const tokens: Record<string, string> = {};
    const tokenRe = /--([\w-]+)\s*:\s*([^;]+);/g;
    let t: RegExpExecArray | null;
    while ((t = tokenRe.exec(body))) {
      const key = t[1];
      const val = t[2];
      if (key !== undefined && val !== undefined) tokens[key] = val.trim();
    }
    blocks.push({ selector: selector.trim(), tokens });
  }
  return blocks;
}

const BLOCKS = parseBlocks(css);

/** Resolve semantic tokens for a theme×scheme, mirroring the CSS cascade. */
function resolveTokens(theme: string, dark: boolean): Record<string, string> {
  const acc: Record<string, string> = {};
  for (const { selector, tokens } of BLOCKS) {
    for (const sel of selector.split(",").map((s) => s.trim())) {
      const isDark = sel.includes(".dark");
      if (isDark !== dark) continue;
      const matchesTheme =
        sel.includes(`[data-theme="${theme}"]`) ||
        sel === ":root" ||
        sel === ".dark";
      if (matchesTheme) Object.assign(acc, tokens);
    }
  }
  return acc;
}

// Small body text / control labels → AA 1.4.3 (4.5:1).
const TEXT_PAIRS: [fg: string, bg: string][] = [
  ["foreground", "background"],
  ["surface-foreground", "surface"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "background"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["success-foreground", "success"],
  ["warning-foreground", "warning"],
  ["info-foreground", "info"],
];

// Form-control borders + focus ring → AA 1.4.11 non-text (3:1).
const NON_TEXT_PAIRS: [fg: string, bg: string][] = [
  ["input", "background"],
  ["ring", "background"],
];

const COMBOS = UI_THEME_IDS.flatMap((theme) =>
  [false, true].map((dark) => ({
    theme,
    dark,
    label: `${theme}/${dark ? "dark" : "light"}`,
  })),
);

describe("theme token contrast (issue #132)", () => {
  it.each(COMBOS)(
    "$label — body text pairs meet AA 4.5:1",
    ({ theme, dark }) => {
      const tok = resolveTokens(theme, dark);
      for (const [fg, bg] of TEXT_PAIRS) {
        const fgVal = tok[fg];
        const bgVal = tok[bg];
        expect(fgVal, `missing --${fg}`).toBeDefined();
        expect(bgVal, `missing --${bg}`).toBeDefined();
        if (fgVal === undefined || bgVal === undefined) continue;
        const ratio = contrast(fgVal, bgVal);
        expect(
          ratio,
          `--${fg} on --${bg} = ${ratio.toFixed(2)}:1 (need 4.5)`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(COMBOS)(
    "$label — control/focus pairs meet AA 3:1",
    ({ theme, dark }) => {
      const tok = resolveTokens(theme, dark);
      for (const [fg, bg] of NON_TEXT_PAIRS) {
        const fgVal = tok[fg];
        const bgVal = tok[bg];
        expect(fgVal, `missing --${fg}`).toBeDefined();
        expect(bgVal, `missing --${bg}`).toBeDefined();
        if (fgVal === undefined || bgVal === undefined) continue;
        const ratio = contrast(fgVal, bgVal);
        expect(
          ratio,
          `--${fg} on --${bg} = ${ratio.toFixed(2)}:1 (need 3.0)`,
        ).toBeGreaterThanOrEqual(3.0);
      }
    },
  );
});
