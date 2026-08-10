import { readFileSync } from "node:fs";
import { join } from "node:path";

import defaultTheme from "tailwindcss/defaultTheme";
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

/**
 * Bans on untokenized motion, written once so the pattern and the sample
 * proving it still fires cannot rot independently (#750).
 *
 * Each of these is the only check that can notice its violation. A hard-coded
 * easing or duration *adds* a declaration or a class; it does not displace the
 * tokens asserted positively alongside it, so those assertions pass with the
 * violation present. A negative over source text passes whenever the literal is
 * absent, and a misspelled literal is always absent.
 *
 * Three of these have an upstream referent, so their probe samples are built
 * from Tailwind's default theme rather than typed out here (#756). That matters
 * because these classes are banned precisely *because* Tailwind still ships
 * them: `tailwind.config.ts` uses `extend`, so the untokenized defaults stay
 * reachable beside our tokens. If a key were renamed or dropped upstream the
 * class could no longer be written, the ban would forbid nothing, and a
 * hand-typed sample would keep passing forever. Deriving the sample means that
 * case fails loudly and gets revisited instead of quietly retyped.
 *
 * `transform:` has no referent — it is a CSS property, not an API — so it keeps
 * a hand-written probe. That is the third category from #732, and it is the
 * only tool available for it.
 */
const EASE_OUT_KEY = "out";
const DURATION_150_KEY = "150";
const DURATION_200_KEY = "200";

const upstreamEasing = (key: string) => {
  expect(
    Object.keys(defaultTheme.transitionTimingFunction ?? {}),
    `Tailwind no longer defines the "${key}" easing, so the ease-${key} ban can never fire. If it was renamed or dropped upstream, this ban needs revisiting, not just retyping.`,
  ).toContain(key);
  return `ease-${key}`;
};

const upstreamDuration = (key: string) => {
  expect(
    Object.keys(defaultTheme.transitionDuration ?? {}),
    `Tailwind no longer defines the "${key}" duration, so the duration-${key} ban can never fire. If it was renamed or dropped upstream, this ban needs revisiting, not just retyping.`,
  ).toContain(key);
  return `duration-${key}`;
};

const HARDCODED_EASE = `ease-${EASE_OUT_KEY}`;
const RAW_TRANSFORM = "transform:";
const DURATION_150 = new RegExp(`duration-${DURATION_150_KEY}\\b`);
const DURATION_200 = new RegExp(`duration-${DURATION_200_KEY}\\b`);

describe("motion bans (issue #750)", () => {
  it("still matches hard-coded easing and durations, so the bans can fire", () => {
    // Samples built from the upstream keys, so they cannot go stale (#756).
    expect(
      `animation: "fade-in 0.2s ${upstreamEasing(EASE_OUT_KEY)}"`,
    ).toContain(HARDCODED_EASE);
    expect(
      DURATION_150.test(
        `transition-colors ${upstreamDuration(DURATION_150_KEY)}`,
      ),
    ).toBe(true);
    expect(
      DURATION_200.test(
        `transition-shadow ${upstreamDuration(DURATION_200_KEY)}`,
      ),
    ).toBe(true);
    // No referent: a CSS property, not an API. Hand-written sample is the only
    // option here.
    expect('"pop-in": { transform: "scale(0.96)" }').toContain(RAW_TRANSFORM);
  });
});

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
    expect(TAILWIND).not.toContain(HARDCODED_EASE);
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

  it("keeps translated overlays positioned while they pop (issue #620)", () => {
    const popKeyframes = TAILWIND.slice(
      TAILWIND.indexOf('"pop-in": {'),
      TAILWIND.indexOf('"slide-in-from-right": {'),
    );

    expect(popKeyframes).toContain('scale: "0.96"');
    expect(popKeyframes).toContain('scale: "1"');
    expect(popKeyframes).not.toContain(RAW_TRANSFORM);
  });

  it("adopts the tokens in the primitives instead of literal durations", () => {
    const button = read("src", "components", "ui", "button.tsx");
    const card = read("src", "components", "ui", "card.tsx");
    const tabs = read("src", "components", "ui", "tabs.tsx");

    expect(button).toContain("duration-fast");
    expect(button).not.toMatch(DURATION_150);
    expect(card).toContain("duration-base");
    expect(card).not.toMatch(DURATION_200);
    expect(tabs).toContain("duration-fast");
  });
});
