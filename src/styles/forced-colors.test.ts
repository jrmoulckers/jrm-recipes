import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * OS forced-colors + prefers-contrast guard (issue #96).
 *
 * These rules respond to system accessibility signals with no in-app toggle, so
 * they cannot be exercised in jsdom. We assert the stylesheet ships the right
 * at-rules and uses real system color keywords + a non-box-shadow focus
 * outline, and that they live inside media queries (no default-render impact).
 */

const ROOT = process.cwd();
const A11Y_CSS = readFileSync(
  join(ROOT, "src", "styles", "a11y.css"),
  "utf8",
).replace(/\r\n/g, "\n");

/**
 * Bans, written once so the pattern and the sample proving it still fires
 * cannot rot independently (#750).
 *
 * Each is the only check that can notice its violation: a `box-shadow` focus
 * ring coexists with the required `outline`, and a system-color keyword outside
 * the media blocks coexists with the same keyword inside them, so every
 * positive assertion in this file passes with the violation present. A negative
 * over source text passes whenever the literal is absent, and a misspelled
 * literal is always absent.
 */
const BOX_SHADOW_DECL = /box-shadow\s*:/;
const SYSTEM_COLORS = ["ButtonText", "Highlight", "Canvas"] as const;

describe("forced-colors bans (issue #750)", () => {
  it("still matches a box-shadow focus ring, so the ban can fire", () => {
    expect(
      BOX_SHADOW_DECL.test(":focus-visible { box-shadow: 0 0 0 2px; }"),
    ).toBe(true);
  });

  it.each(SYSTEM_COLORS)(
    "is a keyword the stylesheet really uses, so the ban can fire (%s)",
    (keyword) => {
      // Anchored to real content, not to an interpolated sample. A probe that
      // builds its haystack from the needle -- `expect(`...${keyword}...`)
      // .toContain(keyword)` -- is satisfied by every possible string including
      // a misspelled one, so it anchors nothing (#754). Elements 1 and 2 were
      // separately pinned by the positives below, which left element 0 free to
      // rot: with `ButtonText` misspelled here, a real `ButtonText` leak outside
      // the media blocks went from 1 failed to 8 passed.
      expect(block(A11Y_CSS, "@media (forced-colors: active)")).toContain(
        keyword,
      );
    },
  );

  it("has a probe per keyword, so the table cannot empty unnoticed", () => {
    // `it.each([])` registers zero tests and passes with no error or warning,
    // and `:110` iterates this same array, so emptying it would make the ban
    // and its own probe vacuous together from a single edit (#754).
    expect(SYSTEM_COLORS.length).toBeGreaterThan(0);
  });
});

function block(css: string, atRule: string): string {
  // Anchor to the real rule (`atRule {`), not a mention inside a comment.
  const start = css.indexOf(`${atRule} {`);
  expect(start, `${atRule} present`).toBeGreaterThanOrEqual(0);
  // Walk braces from the first "{" after the at-rule to its matching close.
  let i = css.indexOf("{", start);
  let depth = 0;
  const from = i;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(from, i + 1);
    }
  }
  throw new Error(`Unbalanced braces for ${atRule}`);
}

describe("forced-colors + prefers-contrast (issue #96)", () => {
  it("adopts high-contrast token overrides under prefers-contrast: more", () => {
    const css = block(A11Y_CSS, "@media (prefers-contrast: more)");
    // Mirrors the [data-contrast="high"] neutral overrides.
    expect(css).toMatch(/--ring-width:\s*3px/);
    expect(css).toMatch(/--border:\s*0 0% 28%/); // light
    expect(css).toMatch(/--border:\s*0 0% 74%/); // dark
    expect(css).toMatch(/--ring:\s*0 0% 0%/);
    expect(css).toMatch(/--ring:\s*0 0% 100%/);
    // #130 gates the OS override so an explicit in-app opt-out still wins.
    expect(css).toContain(':root:not([data-contrast="off"]).dark');
    expect(css).toContain(':root:not([data-contrast="off"]):not(.dark)');
  });

  it("gives controls system-colored borders under forced-colors", () => {
    const css = block(A11Y_CSS, "@media (forced-colors: active)");
    for (const role of ['[role="switch"]', '[role="slider"]']) {
      expect(css).toContain(role);
    }
    expect(css).toMatch(/border:\s*1px solid ButtonText/);
    expect(css).toContain(SYSTEM_COLORS[1]);
    expect(css).toContain(SYSTEM_COLORS[2]);
  });

  it("draws a real focus outline that survives forced-colors", () => {
    const css = block(A11Y_CSS, "@media (forced-colors: active)");
    // Outline (not box-shadow) in a system color, and it must beat outline-none.
    expect(css).toMatch(/outline:\s*2px solid Highlight\s*!important/);
    expect(css).toContain(":focus-visible");
    // The focus indicator is an outline, never a box-shadow declaration.
    expect(css).not.toMatch(BOX_SHADOW_DECL);
  });

  it("scopes everything inside media queries. No default-render regression", () => {
    // Both features are only ever expressed through their media queries.
    expect(A11Y_CSS).toContain("@media (forced-colors: active)");
    expect(A11Y_CSS).toContain("@media (prefers-contrast: more)");
    // No system-color keyword leaks outside the two media blocks.
    const withoutMedia = A11Y_CSS.replace(
      block(A11Y_CSS, "@media (forced-colors: active)"),
      "",
    ).replace(block(A11Y_CSS, "@media (prefers-contrast: more)"), "");
    for (const keyword of SYSTEM_COLORS) {
      expect(withoutMedia).not.toContain(keyword);
    }
  });
});
