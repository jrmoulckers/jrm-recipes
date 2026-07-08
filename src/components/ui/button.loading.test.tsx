import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button } from "./button";

afterEach(cleanup);

describe("Button loading state", () => {
  it("shows a spinner and marks the button busy and non-interactive", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });

    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button).toBeDisabled();
    expect(button.querySelector("svg")?.getAttribute("class")).toContain(
      "animate-spin",
    );
  });

  it("keeps the label mounted and in the a11y tree (opacity-0) while loading", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });

    // Label text stays in the DOM so the box width holds AND — crucially — the
    // accessible name survives. We use `opacity-0`, not `invisible`
    // (visibility:hidden), because visibility:hidden removes the subtree from
    // the accessible-name computation, leaving an unnamed aria-busy button.
    // NOTE: jsdom applies no stylesheet, so it can't actually enforce the
    // visibility-vs-opacity distinction — the class choice below is what
    // guarantees the accessible name in real browsers, so we assert on it.
    expect(button.textContent).toContain("Save");
    const label = button.querySelector("span.opacity-0");
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe("Save");
    // Guard against regressing to visibility:hidden.
    expect(button.querySelector("span.invisible")).toBeNull();
  });

  it("drops the disabled dim so loading reads as 'working', not 'unavailable'", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("disabled:opacity-100");
    expect(button.className).not.toContain("disabled:opacity-50");
  });

  it("renders no spinner and is interactive when not loading", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });

    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button).not.toBeDisabled();
    expect(button.querySelector("svg")).toBeNull();
  });

  it("marks asChild targets busy and non-interactive without a native disabled", () => {
    render(
      <Button asChild loading>
        <a href="#save">Save</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Save" });
    expect(link.getAttribute("aria-busy")).toBe("true");
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.className).toContain("pointer-events-none");
  });
});
