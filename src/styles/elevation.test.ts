import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { UI_THEME_IDS } from "~/config/themes";

/**
 * Elevation-token guard (issue #86).
 *
 * The design system exposes exactly three elevation steps as tokens
 * (`--shadow-sm` / `--shadow` / `--shadow-lg`) so control shadows adapt per UI
 * mode and to dark scheme. This test asserts:
 *   1. `--shadow-sm` is defined for the light default (`:root`) and dark
 *      (`.dark`) as well as every mode that tunes the other shadow steps.
 *   2. No primitive in `src/components/ui` falls back to Tailwind's fixed
 *      neutral shadows (`shadow-sm|shadow-md|shadow-lg`).
 */

const STYLES_DIR = join(process.cwd(), "src", "styles");
const UI_DIR = join(process.cwd(), "src", "components", "ui");

const THEMES_CSS = readFileSync(join(STYLES_DIR, "themes.css"), "utf8");

describe("elevation tokens (issue #86)", () => {
  it("defines --shadow-sm for the light default and dark scheme", () => {
    // Every block that tunes --shadow must also tune --shadow-sm alongside it.
    const shadowBlocks = THEMES_CSS.match(/--shadow:/g) ?? [];
    const shadowSmBlocks = THEMES_CSS.match(/--shadow-sm:/g) ?? [];
    expect(shadowSmBlocks.length).toBe(shadowBlocks.length);
    expect(shadowSmBlocks.length).toBeGreaterThanOrEqual(2);
  });

  it("tunes --shadow-sm per mode wherever --shadow is overridden", () => {
    // Kitchen inherits the :root defaults; the other four modes tune shadows.
    for (const theme of UI_THEME_IDS) {
      const block = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`);
      const match = block.exec(THEMES_CSS);
      if (match && match[1]?.includes("--shadow:")) {
        expect(
          match[1].includes("--shadow-sm:"),
          `[data-theme="${theme}"] tunes --shadow but not --shadow-sm`,
        ).toBe(true);
      }
    }
  });

  it("exposes shadow-token-sm and never leaks a raw Tailwind shadow in ui/", () => {
    const files = readdirSync(UI_DIR).filter((f) => f.endsWith(".tsx"));
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(UI_DIR, file), "utf8");
      // Match class usage like `shadow-sm`/`shadow-lg` but not `shadow-token-*`.
      if (/\bshadow-(sm|md|lg)\b/.test(source)) offenders.push(file);
    }
    expect(offenders, `raw shadow utilities in: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });
});
