import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";
import { OVERLAY_SURFACE } from "./overlay-surface";

afterEach(cleanup);

function renderDialog(className?: string) {
  render(
    <Dialog open>
      <DialogContent className={className}>
        <DialogTitle>Title</DialogTitle>
        <DialogDescription>Body</DialogDescription>
      </DialogContent>
    </Dialog>,
  );
  return screen.getByRole("dialog");
}

function renderSized(size: "sm" | "md" | "lg" | "xl") {
  render(
    <Dialog open>
      <DialogContent size={size}>
        <DialogTitle>Title</DialogTitle>
        <DialogDescription>Body</DialogDescription>
      </DialogContent>
    </Dialog>,
  );
  return screen.getByRole("dialog");
}

describe("DialogContent mobile-safe defaults", () => {
  it("caps height to the viewport, scrolls overflow, and pads the safe area", () => {
    const content = renderDialog();

    // Never exceeds the dynamic viewport height on short screens (issue #291).
    expect(content.className).toContain("max-h-[calc(100dvh-2rem)]");
    // Tall content scrolls internally instead of clipping footer actions.
    expect(content.className).toContain("overflow-y-auto");
    // Bottom content clears the home indicator on notched phones.
    expect(content.className).toContain(
      "pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
    );
    // Width stays clamped within the viewport (no horizontal scroll at 320px).
    expect(content.className).toContain("w-[calc(100%-2rem)]");
  });

  it("lets per-dialog overrides win over the defaults", () => {
    // Mirrors Cook Mode's Overview/Ingredients dialogs, which manage their own
    // height, scrolling, and padding.
    const content = renderDialog("max-h-dvh overflow-hidden p-0");

    expect(content.className).toContain("overflow-hidden");
    expect(content.className).not.toContain("overflow-y-auto");
    expect(content.className).toContain("p-0");
    expect(content.className).not.toContain(
      "pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
    );
    expect(content.className).toContain("max-h-dvh");
    expect(content.className).not.toContain("max-h-[calc(100dvh-2rem)]");
  });
});

describe("DialogContent size variants", () => {
  it("defaults to the historical max-w-lg width", () => {
    expect(renderDialog().className).toContain("max-w-lg");
  });

  it.each([
    ["sm", "max-w-sm"],
    ["md", "max-w-md"],
    ["lg", "max-w-lg"],
    ["xl", "max-w-3xl"],
  ] as const)("maps size=%s to %s", (size, expected) => {
    expect(renderSized(size).className).toContain(expected);
  });

  it("uses the shared overlay surface chrome", () => {
    const content = renderDialog();
    for (const cls of OVERLAY_SURFACE.split(" ")) {
      expect(content.className).toContain(cls);
    }
  });
});

describe("DialogContent sheet variant motion", () => {
  it("slides in a direction-aware axis so the sheet hugs its end-anchored edge", () => {
    render(
      <Dialog open>
        <DialogContent variant="sheet">
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const content = screen.getByRole("dialog");
    // LTR: dock + slide on the right edge.
    expect(content.className).toContain(
      "ltr:data-[state=open]:animate-slide-in-from-right",
    );
    expect(content.className).toContain(
      "ltr:data-[state=closed]:animate-slide-out-to-right",
    );
    // RTL: end-0 resolves to the left, so the slide must flip too (issue #93).
    expect(content.className).toContain(
      "rtl:data-[state=open]:animate-slide-in-from-left",
    );
    expect(content.className).toContain(
      "rtl:data-[state=closed]:animate-slide-out-to-left",
    );
  });
});
