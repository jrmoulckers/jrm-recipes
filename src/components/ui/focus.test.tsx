import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Input } from "./input";
import { Textarea } from "./textarea";

afterEach(cleanup);

/**
 * Standardized focus-visible treatment (issue #85).
 *
 * One canonical, token-driven focus pattern: `ring-2` (which resolves to
 * `--ring-width`) + `ring-ring`, with `outline-none` so the global fallback
 * outline never doubles up. Inputs must show a real ring, not just a border
 * color swap.
 */

const read = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), "utf8");

const RING = [
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-ring",
];

/**
 * Bans on the always-on `focus:` treatments the ring replaced, written once so
 * the pattern and the sample proving it still fires cannot rot independently
 * (#750).
 *
 * These bans are the only checks that can notice their violation. An extra
 * class *adds* to a className rather than displacing the `focus-visible:`
 * classes asserted above, so `RING` is fully satisfied with the violation
 * present — proven by adding `focus:outline-none` beside the existing
 * `focus-visible:outline-none` in `select.tsx` and changing the pattern to
 * `focus:outline-nonee`, which took this file from 1 failed to 4 passed with
 * the offending class still there.
 *
 * Note the probes must not be matched by the `focus-visible:` prefix, which is
 * why each is written as a standalone class rather than a fragment.
 */
const FOCUS_BORDER_SWAP = /focus:border-ring/;
const FOCUS_OUTLINE_RESET = /focus:outline-none/;

const BANS: { what: string; pattern: RegExp; probe: string }[] = [
  {
    what: "the bare focus border swap",
    pattern: FOCUS_BORDER_SWAP,
    probe: "border border-input focus:border-ring",
  },
  {
    what: "the always-on focus outline reset",
    pattern: FOCUS_OUTLINE_RESET,
    probe: "focus:outline-none focus-visible:ring-2",
  },
];

describe("focus-visible bans (issue #750)", () => {
  it.each(BANS)(
    "still matches $what, so the ban can fire",
    ({ pattern, probe }) => {
      expect(pattern.test(probe)).toBe(true);
    },
  );
});

describe("focus-visible standardization (issue #85)", () => {
  it("gives text inputs a real ring beyond a color-only border", () => {
    render(<Input aria-label="name" />);
    const input = screen.getByRole("textbox");
    for (const cls of RING) expect(input.className).toContain(cls);
    expect(input.className).toContain("focus-visible:ring-offset-background");
  });

  it("gives the textarea the same ring recipe", () => {
    render(<Textarea aria-label="notes" />);
    const area = screen.getByRole("textbox");
    for (const cls of RING) expect(area.className).toContain(cls);
  });

  it("drives the ring width from --ring-width so it scales 2->3px", () => {
    // `ring-2` is remapped to the token in Tailwind rather than a literal 2px.
    expect(read("tailwind.config.ts")).toMatch(
      /ringWidth:\s*\{\s*2:\s*"var\(--ring-width\)"/,
    );
  });

  it("unifies the Select trigger and Dialog close on the ring, dropping border-only focus", () => {
    const select = read("src", "components", "ui", "select.tsx");
    for (const cls of RING) expect(select).toContain(cls);
    // The old bare `focus:` border swap is gone (replaced by focus-visible ring).
    expect(select).not.toMatch(FOCUS_BORDER_SWAP);
    expect(select).not.toMatch(FOCUS_OUTLINE_RESET);

    const dialog = read("src", "components", "ui", "dialog.tsx");
    expect(dialog).toContain("focus-visible:outline-none");
    // Close button no longer uses the always-on `focus:outline-none`.
    expect(dialog).not.toMatch(FOCUS_OUTLINE_RESET);
  });
});
