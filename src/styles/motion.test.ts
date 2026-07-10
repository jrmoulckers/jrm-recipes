import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Motion-token guard (issue #95).
 *
 * Motion is tokenized (duration + easing) and scaled by --motion-scale so
 * timings are consistent and modes can tune motion centrally. Simple mode
 * (--motion-scale: 0) collapses tokenized durations to 0ms through the token
 * path rather than per-component overrides.
 */

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const THEMES_CSS = read("src", "styles", "themes.css");
const TAILWIND = read("tailwind.config.ts");

describe("motion tokens (issue #95)", () => {
  it("defines duration tokens scaled by --motion-scale", () => {
    for (const name of [
      "--duration-fast",
      "--duration-base",
      "--duration-slow",
    ]) {
      const decl = new RegExp(
        `${name}:\\s*calc\\([^;]*var\\(--motion-scale\\)`,
      );
      expect(decl.test(THEMES_CSS), `${name} scaled by --motion-scale`).toBe(
        true,
      );
    }
  });

  it("defines named easing tokens", () => {
    expect(THEMES_CSS).toMatch(/--ease-standard:\s*cubic-bezier/);
    expect(THEMES_CSS).toMatch(/--ease-emphasized:\s*cubic-bezier/);
  });

  it("exposes the tokens through Tailwind and tokenizes keyframe easing", () => {
    expect(TAILWIND).toContain('fast: "var(--duration-fast)"');
    expect(TAILWIND).toContain('standard: "var(--ease-standard)"');
    // The enter animations no longer hard-code ease-out.
    expect(TAILWIND).not.toContain("ease-out");
    expect(TAILWIND).toContain("fade-in 0.2s var(--ease-standard)");
  });

  it("provides direction-aware sheet slide keyframes for RTL (issue #93)", () => {
    // The sheet docks on the logical inline-end edge, so RTL must slide from the
    // opposite physical side. Both directions stay tokenized (no ease-out).
    expect(TAILWIND).toContain(
      '"slide-in-from-left": "slide-in-from-left 0.24s var(--ease-standard)"',
    );
    expect(TAILWIND).toContain(
      '"slide-out-to-left": "slide-out-to-left 0.2s var(--ease-standard)"',
    );
    expect(TAILWIND).toContain("translateX(-100%)");
  });

  it("adopts the tokens in the primitives instead of literal durations", () => {
    const button = read("src", "components", "ui", "button.tsx");
    const card = read("src", "components", "ui", "card.tsx");
    const tabs = read("src", "components", "ui", "tabs.tsx");

    expect(button).toContain("duration-fast");
    expect(button).not.toMatch(/duration-150\b/);
    expect(card).toContain("duration-base");
    expect(card).not.toMatch(/duration-200\b/);
    expect(tabs).toContain("duration-fast");
  });
});
