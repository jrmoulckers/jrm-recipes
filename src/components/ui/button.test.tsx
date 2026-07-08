import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button, buttonVariants } from "./button";

afterEach(cleanup);

// Token-driven, always-visible keyboard focus indicator (issue #113). The base
// variant string previously stripped the outline (`focus-visible:outline-none`)
// without re-adding a ring, so every <Button> had an invisible focus state.
const FOCUS_RING_CLASSES = [
  "focus-visible:ring-2",
  "focus-visible:ring-ring",
  "focus-visible:ring-offset-2",
];

describe("Button focus-visible indicator", () => {
  it("re-adds a token-driven ring after clearing the default outline", () => {
    const base = buttonVariants();

    // The outline is still cleared so browsers don't double up on indicators...
    expect(base).toContain("focus-visible:outline-none");
    // ...but a visible ring replaces it, keyed off semantic tokens only.
    for (const cls of FOCUS_RING_CLASSES) {
      expect(base).toContain(cls);
    }
    // The offset paints against the page background so the ring stays legible.
    expect(base).toContain("ring-offset-background");
  });

  it("uses semantic ring tokens rather than hard-coded colors", () => {
    const base = buttonVariants();

    expect(base).toContain("focus-visible:ring-ring");
    // No literal color escapes into the focus treatment.
    expect(base).not.toMatch(/focus-visible:ring-\[?#/);
    expect(base).not.toMatch(/focus-visible:ring-(?:white|black|blue|red)/);
  });

  it.each([
    "default",
    "secondary",
    "accent",
    "outline",
    "ghost",
    "destructive",
    "link",
  ] as const)("keeps the focus ring on the %s variant", (variant) => {
    const classes = buttonVariants({ variant });

    for (const cls of FOCUS_RING_CLASSES) {
      expect(classes).toContain(cls);
    }
  });

  it("renders the focus ring on a real <button>", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });

    for (const cls of FOCUS_RING_CLASSES) {
      expect(button.className).toContain(cls);
    }
  });

  it("keeps the focus ring on asChild links", () => {
    render(
      <Button asChild>
        <a href="#browse">Browse</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Browse" });

    for (const cls of FOCUS_RING_CLASSES) {
      expect(link.className).toContain(cls);
    }
  });
});

describe("Button data-variant hook (issue #131)", () => {
  // Forced-colors CSS targets buttons by variant (brand fills are ignored by the
  // OS), so the variant must be exposed on the DOM node, not just in classes.
  it("defaults to data-variant=\"default\" when no variant is given", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "data-variant",
      "default",
    );
  });

  it.each([
    "secondary",
    "accent",
    "outline",
    "ghost",
    "destructive",
    "link",
  ] as const)("reflects the %s variant on the element", (variant) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute(
      "data-variant",
      variant,
    );
  });
});
