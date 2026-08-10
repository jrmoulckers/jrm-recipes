import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Notification surface (issue #647).
 *
 * Toasts, the PWA install nudge and the "update available" prompt are one
 * design. These are the specific ways that unity broke before, each of which is
 * invisible in a unit test of any single component:
 *
 *  - `richColors` re-enabled at a call site, which repaints toasts as a
 *    full-bleed tinted slab that matches nothing else in the app.
 *  - The toast close button losing its explicit `min-width`/`min-height`, which
 *    lets the global 44px `--tap-min` floor in globals.css inflate it into an
 *    oversized disc that Sonner then parks half outside the card.
 *  - A banner drifting back to its own hand-rolled card classes instead of the
 *    shared surface.
 */
const root = process.cwd();
const read = (relative: string) =>
  readFileSync(join(root, relative), "utf8").replace(/\s+/g, " ");
/** Source with comments removed, so prose about a pitfall never trips a check. */
const readCode = (relative: string) =>
  readFileSync(join(root, relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\s+/g, " ");

const GLOBALS_CSS = read("src/styles/globals.css");
const SONNER = readCode("src/components/ui/sonner.tsx");

/**
 * The Sonner prop that must stay off (#732).
 *
 * The check below is two negatives with no positive beside it, and setting this
 * prop removes nothing, so nothing anchors the literal: a typo would leave that
 * test asserting nothing at all, silently, forever.
 *
 * So it is anchored to Sonner's own published types. That also makes the check
 * fail if the prop is renamed or removed upstream — at which point the ban is
 * meaningless and should be revisited rather than quietly kept.
 */
const RICH_COLORS = "richColors";
const HAND_ROLLED_CARD = "bg-card/95";

describe("toast surface", () => {
  it("bans a prop Sonner really has, so the ban cannot rot", () => {
    expect(
      readFileSync(join(root, "node_modules/sonner/dist/index.d.ts"), "utf8"),
      `Sonner declares no "${RICH_COLORS}" prop, so the check below can never fire. If it was renamed or dropped upstream, this ban needs revisiting, not just retyping.`,
    ).toContain(`${RICH_COLORS}?:`);
  });

  it("never turns on rich colors. Tone is a tinted icon badge, not a fill", () => {
    expect(readCode("src/app/providers.tsx")).not.toContain(RICH_COLORS);
    expect(SONNER).not.toContain(RICH_COLORS);
  });

  it("owns placement and dismissal centrally so call sites cannot drift", () => {
    expect(SONNER).toContain('position="top-center"');
    expect(SONNER).toContain("closeButton");
  });

  it("tints the leading icon badge per toast type", () => {
    for (const [type, token] of [
      ["success", "--success"],
      ["error", "--destructive"],
      ["warning", "--warning"],
      ["info", "--info"],
    ]) {
      const rule = new RegExp(
        `\\[data-type="${type}"\\][^{]*\\[data-icon\\] \\{[^}]*hsl\\(var\\(${token}`,
      );
      expect(GLOBALS_CSS).toMatch(rule);
    }
  });

  it("keeps the dismiss button inside the card at the standard 24px size", () => {
    const closeButtonRule = /\[data-close-button\] \{([^}]*)\}/.exec(
      GLOBALS_CSS,
    )?.[1];
    expect(closeButtonRule).toBeDefined();
    // Parked on the trailing edge, not Sonner's leading-corner overhang.
    expect(closeButtonRule).toContain("inset-inline-end: 0.5rem");
    expect(closeButtonRule).toContain("transform: none");
    // Pinned against the global 44px tap-target floor for <button>.
    expect(closeButtonRule).toContain("min-width: 1.5rem");
    expect(closeButtonRule).toContain("min-height: 1.5rem");
  });

  it("draws the card from theme tokens, never hard-coded color", () => {
    const toastRule = /\[data-sonner-toast\]\[data-styled\] \{([^}]*)\}/.exec(
      GLOBALS_CSS,
    )?.[1];
    expect(toastRule).toContain("hsl(var(--popover)");
    expect(toastRule).toContain("var(--shadow-lg)");
  });
});

describe("notification banners", () => {
  it("still matches the hand-rolled card class, so the ban can fire (#750)", () => {
    // The ban below is the only check that can notice its violation: the class
    // is *added* to a className and does not displace the shared-surface calls
    // asserted positively beside it. A negative over source text passes
    // whenever the literal is absent, and a misspelled literal is always absent.
    expect(
      '<div className="rounded-lg border bg-card/95 p-4 shadow-lg">',
    ).toContain(HAND_ROLLED_CARD);
  });

  it.each([
    "src/components/pwa/install-prompt.tsx",
    "src/components/pwa/update-prompt.tsx",
  ])("%s uses the shared surface instead of its own card", (file) => {
    const source = readCode(file);
    expect(source).toContain("notificationSurface()");
    expect(source).toContain("notificationIcon(");
    expect(source).toContain("notificationTitle");
    expect(source).toContain("notificationDescription");
    // The hand-rolled card these replaced.
    expect(source).not.toContain(HAND_ROLLED_CARD);
  });
});
