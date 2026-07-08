import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Switch } from "./switch";

afterEach(cleanup);

/** The thumb is the single <span> Radix renders inside the switch button. */
function thumbOf(root: HTMLElement): HTMLElement {
  const thumb = root.querySelector("span");
  if (!thumb) throw new Error("switch thumb not found");
  return thumb;
}

describe("Switch large-target sizing", () => {
  it("drives the pill dimensions from --control-scale so they grow in Kids/Simple", () => {
    render(<Switch aria-label="notify" />);
    const root = screen.getByRole("switch");

    expect(root.className).toContain("h-[calc(1.5rem*var(--control-scale))]");
    expect(root.className).toContain("w-[calc(2.75rem*var(--control-scale))]");
  });

  it("renders as a <button> so the global button min-height (--tap-min) governs its hit height", () => {
    render(<Switch aria-label="notify" />);
    // globals.css: `button { min-height: var(--tap-min) }` — Kids 3rem / Simple 2.75rem.
    expect(screen.getByRole("switch").tagName).toBe("BUTTON");
  });

  it("scales the thumb and keeps the checked thumb flush at any scale", () => {
    render(<Switch aria-label="notify" />);
    const thumb = thumbOf(screen.getByRole("switch"));

    expect(thumb.className).toContain("size-[calc(1.25rem*var(--control-scale))]");
    // Travel = inner width - thumb = (2.75 - 0.25)s - 1.25s = 1.5s - 0.25rem, where
    // the fixed 0.25rem is the preserved 2px border on each edge.
    expect(thumb.className).toContain(
      "data-[state=checked]:translate-x-[calc(1.5rem*var(--control-scale)_-_0.25rem)]",
    );
    expect(thumb.className).toContain("data-[state=unchecked]:translate-x-0");
  });

  it("keeps the 2px offset border and the focus ring that scales with --ring-width", () => {
    render(<Switch aria-label="notify" />);
    const root = screen.getByRole("switch");

    expect(root.className).toContain("border-2");
    expect(root.className).toContain("border-transparent");
    expect(root.className).toContain("focus-visible:ring-2");
    expect(root.className).toContain("disabled:opacity-50");
  });

  it("still merges a caller-provided className", () => {
    render(<Switch aria-label="notify" className="ms-3" />);
    expect(screen.getByRole("switch").className).toContain("ms-3");
  });
});
