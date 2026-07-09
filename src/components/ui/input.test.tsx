import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Input } from "./input";
import { Textarea } from "./textarea";

afterEach(cleanup);

// A destructive border/ring keyed off aria-invalid gives sighted users a visual
// cue that matches the ARIA state screen readers already get (#144).
describe("invalid-state styling", () => {
  it("Input carries the destructive invalid variant", () => {
    render(<Input aria-label="field" />);
    const input = screen.getByLabelText("field");
    expect(input.className).toContain("aria-[invalid=true]:border-destructive");
    expect(input.className).toContain(
      "aria-[invalid=true]:focus-visible:ring-destructive",
    );
  });

  it("Textarea carries the destructive invalid variant", () => {
    render(<Textarea aria-label="field" />);
    const textarea = screen.getByLabelText("field");
    expect(textarea.className).toContain(
      "aria-[invalid=true]:border-destructive",
    );
    expect(textarea.className).toContain(
      "aria-[invalid=true]:focus-visible:ring-destructive",
    );
  });
});
