import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Checkbox } from "./checkbox";

afterEach(cleanup);

describe("Checkbox", () => {
  it("renders a real checkbox role driven by tokens", () => {
    render(<Checkbox aria-label="agree" />);
    const box = screen.getByRole("checkbox");
    expect(box).toHaveClass("border-input", "focus-visible:ring-2");
    expect(box.className).toContain("data-[state=checked]:bg-primary");
  });

  it("reflects the checked state", () => {
    render(<Checkbox aria-label="agree" checked />);
    expect(screen.getByRole("checkbox")).toHaveAttribute(
      "data-state",
      "checked",
    );
  });

  it("supports an indeterminate state", () => {
    render(<Checkbox aria-label="agree" checked="indeterminate" />);
    expect(screen.getByRole("checkbox")).toHaveAttribute(
      "data-state",
      "indeterminate",
    );
  });

  it("carries the shared disabled treatment", () => {
    render(<Checkbox aria-label="agree" disabled />);
    const box = screen.getByRole("checkbox");
    expect(box).toBeDisabled();
    expect(box.className).toContain("disabled:opacity-50");
  });

  it("merges a caller-provided className", () => {
    render(<Checkbox aria-label="agree" className="ms-2" />);
    expect(screen.getByRole("checkbox")).toHaveClass("ms-2");
  });
});
