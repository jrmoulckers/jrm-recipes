import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Slider } from "./slider";

// Radix Slider measures its thumb via ResizeObserver, which jsdom lacks.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        /* no-op */
      }
      unobserve() {
        /* no-op */
      }
      disconnect() {
        /* no-op */
      }
    },
  );
});

afterEach(cleanup);

function renderSlider() {
  const { container } = render(
    <Slider defaultValue={[50]} max={100} step={1} aria-label="amount" />,
  );
  const root = container.firstElementChild as HTMLElement;
  return { container, root };
}

describe("Slider large-target sizing", () => {
  it("floors the interactive strip to --control-min so the whole strip meets --tap-min in Kids/Simple", () => {
    const { root } = renderSlider();
    // Default `--control-min: 0px` adds no height; Kids/Simple raise it to --tap-min.
    expect(root.className).toContain("min-h-[var(--control-min)]");
    expect(root.className).toContain("items-center");
  });

  it("scales the track thickness with --control-scale", () => {
    const { container } = renderSlider();
    const track = container.querySelector(".bg-muted");
    expect(track?.className).toContain("h-[calc(0.5rem*var(--control-scale))]");
  });

  it("scales the thumb with --control-scale while keeping its focus ring and disabled state", () => {
    renderSlider();
    const thumb = screen.getByRole("slider");

    expect(thumb.className).toContain(
      "size-[calc(1.25rem*var(--control-scale))]",
    );
    expect(thumb.className).toContain("focus-visible:ring-2");
    expect(thumb.className).toContain("disabled:opacity-50");
  });

  it("still merges a caller-provided className on the root", () => {
    const { container } = render(
      <Slider
        defaultValue={[10]}
        max={100}
        aria-label="amount"
        className="mt-4"
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("mt-4");
    expect(root.className).toContain("min-h-[var(--control-min)]");
  });
});
