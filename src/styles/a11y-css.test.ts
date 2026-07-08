import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// These assert the CSS *contract* for OS-driven accessibility. Forced-colors and
// prefers-* cannot be simulated in jsdom, so we verify the source rules exist and
// stay wired the way the components + provider depend on.
const a11yCss = readFileSync(join(process.cwd(), "src/styles/a11y.css"), "utf8");
const globalsCss = readFileSync(
  join(process.cwd(), "src/styles/globals.css"),
  "utf8",
);

describe("forced-colors support (issue #131)", () => {
  it("declares a forced-colors layer", () => {
    expect(a11yCss).toContain("@media (forced-colors: active)");
  });

  it("gives selected / pressed / current / active states a system-color indicator", () => {
    for (const selector of [
      '[aria-pressed="true"]',
      '[aria-selected="true"]',
      '[aria-current]:not([aria-current="false"])',
      '[data-state="on"]',
      '[data-state="active"]',
    ]) {
      expect(a11yCss).toContain(selector);
    }
    // Uses the guaranteed-contrasting system SELECTION pair.
    expect(a11yCss).toContain("background-color: Highlight");
    expect(a11yCss).toContain("color: HighlightText");
  });

  it("keeps a visible focus outline using system colors", () => {
    expect(a11yCss).toMatch(/:focus-visible[\s\S]*outline: 2px solid Highlight/);
  });

  it("emphasizes primary/destructive/accent buttons by variant", () => {
    expect(a11yCss).toContain('button[data-variant="default"]');
    expect(a11yCss).toContain('button[data-variant="destructive"]');
    expect(a11yCss).toContain('button[data-variant="accent"]');
  });
});

describe("OS preference gating (issue #130)", () => {
  it("lets an explicit motion opt-out override prefers-reduced-motion", () => {
    expect(globalsCss).toContain("prefers-reduced-motion: reduce");
    expect(globalsCss).toContain(':root:not([data-motion="off"])');
  });

  it("lets an explicit contrast opt-out override prefers-contrast", () => {
    expect(a11yCss).toContain("prefers-contrast: more");
    expect(a11yCss).toContain(':root:not([data-contrast="off"])');
  });
});
