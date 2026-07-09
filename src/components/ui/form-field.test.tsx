import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { FormField } from "./form-field";
import { Input } from "./input";

afterEach(cleanup);

describe("<FormField />", () => {
  it("associates the label with the control", async () => {
    const user = userEvent.setup();
    render(
      <FormField label="Group name">
        <Input defaultValue="" />
      </FormField>,
    );

    const input = screen.getByLabelText("Group name");
    expect(input.tagName).toBe("INPUT");

    // Clicking the label focuses the control (real for/id association).
    await user.click(screen.getByText("Group name"));
    expect(input).toHaveFocus();
  });

  it("renders the hint and links it via aria-describedby while valid", () => {
    render(
      <FormField label="Name" hint="Shown to your family">
        <Input />
      </FormField>,
    );

    const input = screen.getByLabelText("Name");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Shown to your family",
    );
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("wires aria-invalid + aria-describedby to the error and hides the hint", () => {
    render(
      <FormField label="Name" hint="Shown to your family" error={["Too short"]}>
        <Input />
      </FormField>,
    );

    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-invalid", "true");

    const describedBy = input.getAttribute("aria-describedby");
    const errorEl = document.getElementById(describedBy!);
    expect(errorEl).toHaveTextContent("Too short");
    // The error region is polite so it is announced when it appears post-submit.
    expect(errorEl).toHaveAttribute("aria-live", "polite");

    // Hint is suppressed while the field is in error.
    expect(screen.queryByText("Shown to your family")).toBeNull();
  });

  it("accepts a bare string error and marks required fields", () => {
    render(
      <FormField label="Name" required error="Required">
        <Input />
      </FormField>,
    );

    const input = screen.getByLabelText(/Name/);
    expect(input).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("Required")).toBeTruthy();
  });

  it("preserves an existing aria-describedby on the child", () => {
    render(
      <FormField label="Name" error="Bad">
        <Input aria-describedby="external-note" />
      </FormField>,
    );

    const input = screen.getByLabelText("Name");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toContain("external-note");
    expect(describedBy).toContain("-error");
  });
});
