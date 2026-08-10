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

/**
 * Bans on untokenized motion (#750, #756, #758).
 *
 * `duration-*` and the animation easings are asserted by **extracting** what is
 * actually used and comparing it against the tokenized set, rather than banning
 * a literal. That matters twice over:
 *
 * - It fails *closed*. `not.toContain(literal)` fails open, because a typo makes
 *   the literal absent and absence is indistinguishable from passing. A rotted
 *   extractor here yields `[]`, which is not equal to the expected set.
 * - It asserts the property rather than one instance of it. The previous version
 *   checked `button` against `duration-150` and `card` against `duration-200` —
 *   two of the ten durations Tailwind ships, one per file — so `duration-300`
 *   added beside `duration-fast` passed, `tabs.tsx` had no ban at all, and a
 *   newly added animation with a hardcoded easing passed. All three verified
 *   silent before this change.
 *
 * This also retires the probe/anchor apparatus #753 and #756 built around the
 * two duration literals: with no literal to keep in sync, there is nothing to
 * anchor and nothing to rot.
 *
 * `transform:` keeps a hand-written probe. It names a CSS property rather than a
 * value that can be extracted and compared, and it has no referent to anchor to.
 */
const RAW_TRANSFORM = "transform:";

/** Every `duration-x` utility in a source file, in order. */
const durationTokensIn = (source: string) =>
  [...source.matchAll(/\bduration-([A-Za-z0-9.]+)\b/g)].map((m) => m[1]!);

/** Every animation shorthand declared in the Tailwind `animation` block. */
const animationValues = (config: string) => {
  const start = config.indexOf("animation: {");
  expect(
    start,
    "tailwind.config.ts declares an animation block",
  ).toBeGreaterThan(-1);
  let depth = 0;
  let i = config.indexOf("{", start);
  const from = i;
  for (; i < config.length; i++) {
    if (config[i] === "{") depth++;
    else if (config[i] === "}" && --depth === 0) break;
  }
  return [...config.slice(from, i).matchAll(/:\s*"([^"]+)"/g)].map(
    (m) => m[1]!,
  );
};

describe("motion bans (issue #758)", () => {
  it.each([
    ["button.tsx", ["fast"]],
    ["card.tsx", ["base"]],
    ["tabs.tsx", ["fast"]],
  ] as const)("%s uses only tokenized durations", (file, expected) => {
    expect(durationTokensIn(read("src", "components", "ui", file))).toEqual([
      ...expected,
    ]);
  });

  it("every animation is tokenized, including ones added later", () => {
    const values = animationValues(TAILWIND);
    // Fails closed: a rotted extractor yields [], which has no length.
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value, `"${value}" must use a tokenized easing`).toMatch(
        /var\(--ease-(?:standard|emphasized)\)/,
      );
    }
  });

  it("still matches a raw transform, so that ban can fire", () => {
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
    // Untokenized easings are caught by the extract-and-compare check above,
    // which covers animations added later too (#758).
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

    // Which token each primitive uses. That no *untokenized* duration appears
    // is asserted by extract-and-compare above, for all three files (#758).
    expect(button).toContain("duration-fast");
    expect(card).toContain("duration-base");
    expect(tabs).toContain("duration-fast");
  });
});
