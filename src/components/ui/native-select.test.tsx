import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NativeSelect } from "./native-select";

afterEach(cleanup);

function renderSelect(props = {}) {
  render(
    <NativeSelect aria-label="pick" {...props}>
      <option value="a">A</option>
      <option value="b">B</option>
    </NativeSelect>,
  );
  return screen.getByLabelText("pick");
}

describe("NativeSelect", () => {
  // iOS Safari zooms for any focused control below 16px and never zooms back
  // out, so the native trigger must match Input/Textarea: 16px on mobile,
  // compact only from md up, and a 44px touch target.
  it("is iOS-zoom safe and a 44px tap target", () => {
    const select = renderSelect();
    expect(select).toHaveClass("text-base", "md:text-sm", "h-11");
    expect(select.className).not.toContain(" text-sm");
  });

  it("mirrors the field look (tokens, not raw palette)", () => {
    const select = renderSelect();
    expect(select).toHaveClass(
      "rounded-lg",
      "border-input",
      "bg-background",
      "shadow-token-sm",
      "appearance-none",
    );
  });

  it("carries the destructive invalid variant", () => {
    const select = renderSelect();
    expect(select.className).toContain("aria-[invalid=true]:border-destructive");
    expect(select.className).toContain(
      "aria-[invalid=true]:focus-visible:ring-destructive",
    );
  });

  it("renders a decorative chevron and forwards options", () => {
    const select = renderSelect();
    expect(select.querySelectorAll("option")).toHaveLength(2);
    // The chevron is a sibling of the select inside the wrapper, aria-hidden.
    const wrapper = select.parentElement!;
    expect(wrapper.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("merges a caller-provided className", () => {
    renderSelect({ className: "w-40" });
    expect(screen.getByLabelText("pick")).toHaveClass("w-40");
  });
});
