import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Spinner } from "./spinner";

afterEach(cleanup);

describe("Spinner", () => {
  it("is decorative by default and animates via currentColor", () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("class")).toContain("animate-spin");
    // Sized in em so it inherits the surrounding text size.
    expect(svg?.getAttribute("class")).toContain("size-[1em]");
    // Colour comes from currentColor, never a hard-coded value.
    expect(svg?.innerHTML).toContain('stroke="currentColor"');
    expect(svg?.getAttribute("class")).not.toMatch(
      /text-(?:white|black|blue|red)/,
    );
  });

  it("exposes an accessible status role when labelled", () => {
    const { getByRole } = render(<Spinner label="Loading" />);
    const el = getByRole("status");
    expect(el.getAttribute("aria-label")).toBe("Loading");
  });
});
