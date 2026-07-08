import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  tooltipVariants,
} from "./tooltip";

// Radix's arrow measures itself via ResizeObserver, which jsdom doesn't provide.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {
      // no-op: element measurements are irrelevant in jsdom
    }
    unobserve() {
      // no-op
    }
    disconnect() {
      // no-op
    }
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe("tooltipVariants", () => {
  it("keeps the default single-line chip unchanged in size and weight", () => {
    const base = tooltipVariants();
    expect(base).toContain("bg-foreground");
    expect(base).toContain("text-background");
    expect(base).toContain("text-xs");
    expect(base).toContain("font-medium");
    expect(base).toContain("px-2.5");
    expect(base).toContain("py-1.5");
  });

  it("offers a softer popover surface variant", () => {
    const soft = tooltipVariants({ variant: "soft" });
    expect(soft).toContain("bg-popover");
    expect(soft).toContain("text-popover-foreground");
    expect(soft).toContain("border");
  });

  it("wraps multiline content at a sensible max width with readable leading", () => {
    const multi = tooltipVariants({ multiline: true });
    expect(multi).toContain("max-w-xs");
    expect(multi).toContain("leading-relaxed");
    expect(multi).toContain("text-pretty");
  });
});

describe("TooltipContent", () => {
  it("renders a color-matched arrow for the default surface", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent>Hint</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const arrow = document.querySelector("svg.fill-foreground");
    expect(arrow).not.toBeNull();
  });

  it("color-matches the arrow to the soft surface", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent variant="soft" multiline>
            A longer, multiline explanation that should wrap comfortably.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(document.querySelector("svg.fill-popover")).not.toBeNull();
    const content = screen.getAllByText(/longer, multiline explanation/)[0]!;
    expect(content.className).toContain("max-w-xs");
  });
});
