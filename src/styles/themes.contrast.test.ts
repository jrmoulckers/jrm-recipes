import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { UI_THEME_IDS } from "~/config/themes";

/**
 * Contrast regression guard.
 *
 * Parses the semantic color tokens straight out of `themes.css` (the single
 * source of truth) and asserts the WCAG relative-luminance contrast ratio for
 * the pairs that render as solid-fill controls / active nav text, for every
 * theme x color-scheme combination:
 *
 *   • text on a filled control (button foreground on its fill) >= 4.5:1  (AA)
 *   • active nav label (--primary text on --background)         >= 4.5:1  (AA)
 *   • form control border (--input on --background)             >= 3:1    (1.4.11)
 *
 * These thresholds fail on the pre-fix token values and pass afterwards.
 */

type Hsl = { h: number; s: number; l: number };
type Scheme = "light" | "dark";
type Rule = { selectors: string[]; vars: Record<string, string> };

const CSS = readFileSync(
  join(process.cwd(), "src", "styles", "themes.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** Split the stylesheet into { selectors, custom-properties } rules. */
function parseRules(source: string): Rule[] {
  const rules: Rule[] = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let ruleMatch: RegExpExecArray | null;
  while ((ruleMatch = ruleRe.exec(source)) !== null) {
    const selectorText = ruleMatch[1] ?? "";
    const body = ruleMatch[2] ?? "";
    const selectors = selectorText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const vars: Record<string, string> = {};
    const declRe = /--([\w-]+)\s*:\s*([^;]+);/g;
    let declMatch: RegExpExecArray | null;
    while ((declMatch = declRe.exec(body)) !== null) {
      const name = declMatch[1];
      const value = declMatch[2];
      if (name !== undefined && value !== undefined) {
        vars[name] = value.trim();
      }
    }
    rules.push({ selectors, vars });
  }
  return rules;
}

const RULES = parseRules(CSS);

/** Would this single selector apply to <html data-theme=theme class=scheme>? */
function selectorApplies(selector: string, theme: string, scheme: Scheme): boolean {
  const wantsDark = selector.includes(".dark");
  if (scheme === "light" && wantsDark) return false;
  const themeMatch = /\[data-theme="([^"]+)"\]/.exec(selector);
  if (themeMatch !== null && themeMatch[1] !== theme) return false;
  if (selector === ":root") return true;
  return themeMatch !== null;
}

/** Resolve the cascaded token values for a theme + scheme (later rules win). */
function tokensFor(theme: string, scheme: Scheme): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const rule of RULES) {
    if (rule.selectors.some((selector) => selectorApplies(selector, theme, scheme))) {
      Object.assign(resolved, rule.vars);
    }
  }
  return resolved;
}

function parseHsl(triple: string): Hsl {
  const nums = triple
    .replace(/%/g, "")
    .split(/\s+/)
    .map((part) => Number(part));
  return { h: nums[0] ?? 0, s: nums[1] ?? 0, l: nums[2] ?? 0 };
}

function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) =>
    light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [channel(0), channel(8), channel(4)];
}

function relativeLuminance(triple: string): number {
  const [r, g, b] = hslToRgb(parseHsl(triple));
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Look up a token or fail loudly (parsing/renaming regressions surface here). */
function token(tokens: Record<string, string>, name: string, where: string): string {
  const value = tokens[name];
  if (value === undefined) {
    throw new Error(`Missing --${name} for ${where}`);
  }
  return value;
}

const SCHEMES: readonly Scheme[] = ["light", "dark"];

/** foreground-on-fill text pairs that must clear WCAG AA (4.5:1). */
const TEXT_PAIRS: ReadonlyArray<{ fg: string; bg: string; label: string }> = [
  { fg: "primary-foreground", bg: "primary", label: "primary button" },
  { fg: "secondary-foreground", bg: "secondary", label: "secondary button" },
  { fg: "destructive-foreground", bg: "destructive", label: "destructive button" },
  { fg: "accent-foreground", bg: "accent", label: "accent button" },
  { fg: "info-foreground", bg: "info", label: "info fill" },
  { fg: "primary", bg: "background", label: "active nav label" },
];

const TEXT_MIN = 4.5;
const UI_MIN = 3;

describe("themes.css token contrast (WCAG AA)", () => {
  it("parses a rule for every UI theme", () => {
    expect(UI_THEME_IDS.length).toBeGreaterThan(0);
    for (const theme of UI_THEME_IDS) {
      expect(Object.keys(tokensFor(theme, "light")).length).toBeGreaterThan(0);
    }
  });

  for (const theme of UI_THEME_IDS) {
    for (const scheme of SCHEMES) {
      const where = `${theme}/${scheme}`;
      const tokens = tokensFor(theme, scheme);

      describe(where, () => {
        for (const { fg, bg, label } of TEXT_PAIRS) {
          it(`${label} (--${fg} on --${bg}) >= ${TEXT_MIN}:1`, () => {
            const ratio = contrastRatio(
              token(tokens, fg, where),
              token(tokens, bg, where),
            );
            expect(
              ratio,
              `${where} ${label} is ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(TEXT_MIN);
          });
        }

        it(`form control border (--input on --background) >= ${UI_MIN}:1`, () => {
          const ratio = contrastRatio(
            token(tokens, "input", where),
            token(tokens, "background", where),
          );
          expect(
            ratio,
            `${where} --input is ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(UI_MIN);
        });
      });
    }
  }
});
