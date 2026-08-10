import { readdirSync, readFileSync } from "node:fs";
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
 * Bans on untokenized motion (#750, #756, #758, #759).
 *
 * `duration-*` and the animation easings are asserted by **extracting** what is
 * actually used and comparing it against the tokenized set, rather than banning
 * a literal. That matters twice over:
 *
 * - It fails *closed*. `not.toContain(literal)` fails open, because a typo makes
 *   the literal absent and absence is indistinguishable from passing. A rotted
 *   extractor here yields `[]`, which is not equal to the expected set.
 * - It covers every duration rather than one per file. The version before #758
 *   checked `button` against `duration-150` and `card` against `duration-200` —
 *   two of the ten durations Tailwind ships — so `duration-300` added beside
 *   `duration-fast` passed, and a newly added animation with a hardcoded easing
 *   passed. Both verified silent before that change.
 *
 * #759 covers the other axis. #758 still iterated three hand-written filenames,
 * and `src/components/ui` has five files using `duration-*`, so `duration-500`
 * in `dialog.tsx` and `duration-1000` in `close-button.tsx` were both silent on
 * `079b55f`. Enumerating the directory covers new primitives on arrival.
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

/** The body of a named object literal in the Tailwind config. */
const blockOf = (config: string, header: string) => {
  const start = config.indexOf(header);
  expect(start, `tailwind.config.ts declares ${header}`).toBeGreaterThan(-1);
  let depth = 0;
  let i = config.indexOf("{", start);
  const from = i;
  for (; i < config.length; i++) {
    if (config[i] === "{") depth++;
    else if (config[i] === "}" && --depth === 0) break;
  }
  return config.slice(from, i);
};

/** Every animation shorthand declared in the Tailwind `animation` block. */
const animationValues = (config: string) =>
  [...blockOf(config, "animation: {").matchAll(/:\s*"([^"]+)"/g)].map(
    (m) => m[1]!,
  );

/**
 * The duration token names Tailwind exposes, e.g. fast / base / slow.
 *
 * Extracted rather than restated, so the expected side comes from the config
 * that declares the tokens and the actual side from the components that use
 * them. Two independent sources, so this is not a self-supplied comparison.
 */
const tokenizedDurations = (config: string) =>
  [
    ...blockOf(config, "transitionDuration: {").matchAll(
      /(\w+):\s*"var\(--duration-[\w-]+\)"/g,
    ),
  ].map((m) => m[1]!);

/** Every UI primitive, enumerated rather than listed (#759). */
const PRIMITIVES = readdirSync(join(ROOT, "src", "components", "ui")).filter(
  (file) => file.endsWith(".tsx") && !file.includes(".test."),
);

describe("motion bans (issue #758)", () => {
  it("every UI primitive uses only tokenized durations", () => {
    const tokenized = tokenizedDurations(TAILWIND);
    expect(
      tokenized.length,
      "Tailwind exposes duration tokens",
    ).toBeGreaterThan(0);
    expect(PRIMITIVES.length, "UI primitives were found").toBeGreaterThan(0);

    let checked = 0;
    for (const file of PRIMITIVES) {
      for (const used of durationTokensIn(
        read("src", "components", "ui", file),
      )) {
        checked++;
        expect(
          tokenized,
          `${file} uses an untokenized duration-${used}`,
        ).toContain(used);
      }
    }
    // A per-file `toEqual([...])` is non-vacuous by construction, because a
    // non-empty expected value cannot be satisfied by extracting nothing.
    // "Every extracted token is tokenized" is vacuously true over zero tokens,
    // so restating it as a sweep reintroduces the vacuity of #751/#754. Count
    // the assertions actually made.
    expect(checked, "durations were actually extracted").toBeGreaterThan(0);
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
