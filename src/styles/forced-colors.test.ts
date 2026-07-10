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
    expect(css).toContain("Highlight");
    expect(css).toContain("Canvas");
  });

  it("draws a real focus outline that survives forced-colors", () => {
    const css = block(A11Y_CSS, "@media (forced-colors: active)");
    // Outline (not box-shadow) in a system color, and it must beat outline-none.
    expect(css).toMatch(/outline:\s*2px solid Highlight\s*!important/);
    expect(css).toContain(":focus-visible");
    // The focus indicator is an outline, never a box-shadow declaration.
    expect(css).not.toMatch(/box-shadow\s*:/);
  });

  it("scopes everything inside media queries — no default-render regression", () => {
    // Both features are only ever expressed through their media queries.
    expect(A11Y_CSS).toContain("@media (forced-colors: active)");
    expect(A11Y_CSS).toContain("@media (prefers-contrast: more)");
    // No system-color keyword leaks outside the two media blocks.
    const withoutMedia = A11Y_CSS.replace(
      block(A11Y_CSS, "@media (forced-colors: active)"),
      "",
    ).replace(block(A11Y_CSS, "@media (prefers-contrast: more)"), "");
    expect(withoutMedia).not.toContain("ButtonText");
    expect(withoutMedia).not.toContain("Highlight");
    expect(withoutMedia).not.toContain("Canvas");
  });
});
