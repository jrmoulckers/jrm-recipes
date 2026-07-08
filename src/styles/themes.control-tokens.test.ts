import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { THEME_BEHAVIOR, UI_THEME_IDS } from "~/config/themes";

/**
 * Locks the token contract behind issue #94: the interactive-control sizing
 * tokens are no-ops in the default modes (so Kitchen/Whimsy/Professional render
 * unchanged) and grow in exactly the modes that advertise `largeTargets` (Kids
 * and Simple/barebones), where the Switch and Slider must honor `--tap-min`.
 */

const CSS = readFileSync(
  join(process.cwd(), "src", "styles", "themes.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** First declaration block whose selector list matches `selector` exactly. */
function blockFor(selector: string): string {
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRe.exec(CSS)) !== null) {
    const selectors = (match[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (selectors.includes(selector)) return match[2] ?? "";
  }
  throw new Error(`No rule found for selector ${selector}`);
}

function decl(body: string, name: string): string | undefined {
  const m = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(body);
  return m?.[1]?.trim();
}

const ROOT = blockFor(":root");
const KIDS = blockFor('[data-theme="kids"]');
const SIMPLE = blockFor('[data-theme="barebones"]');

describe("themes.css interactive-control tokens (#94)", () => {
  it("defaults to no-op values on :root", () => {
    expect(decl(ROOT, "control-scale")).toBe("1");
    expect(decl(ROOT, "control-min")).toBe("0px");
  });

  it("does not redefine control tokens in the non-large-target modes", () => {
    for (const theme of ["whimsy", "professional"] as const) {
      const body = blockFor(`[data-theme="${theme}"]`);
      expect(decl(body, "control-scale")).toBeUndefined();
      expect(decl(body, "control-min")).toBeUndefined();
    }
  });

  it("keeps THEME_BEHAVIOR.largeTargets aligned with the modes that scale controls", () => {
    // Kids + barebones are the large-target modes; both must raise the tokens.
    expect(THEME_BEHAVIOR.kids.largeTargets).toBe(true);
    expect(THEME_BEHAVIOR.barebones.largeTargets).toBe(true);
    for (const theme of ["kitchen", "whimsy", "professional"] as const) {
      expect(THEME_BEHAVIOR[theme].largeTargets).toBe(false);
    }
  });

  it("grows the Switch/Slider and floors their hit area to --tap-min in Kids", () => {
    expect(Number(decl(KIDS, "control-scale"))).toBeGreaterThan(1);
    expect(decl(KIDS, "control-min")).toBe("var(--tap-min)");
    // 1.5rem * 2 === 3rem === Kids --tap-min, so the pill lands on the tap target.
    expect(decl(KIDS, "tap-min")).toBe("3rem");
    expect(Number(decl(KIDS, "control-scale"))).toBe(2);
  });

  it("grows the Switch/Slider and floors their hit area to --tap-min in Simple", () => {
    expect(Number(decl(SIMPLE, "control-scale"))).toBeGreaterThan(1);
    expect(decl(SIMPLE, "control-min")).toBe("var(--tap-min)");
    expect(decl(SIMPLE, "tap-min")).toBe("2.75rem");
  });

  it("covers every registered UI theme", () => {
    // Guards against a new mode being added without considering control sizing.
    expect(UI_THEME_IDS).toEqual([
      "kitchen",
      "whimsy",
      "professional",
      "kids",
      "barebones",
    ]);
  });
});
