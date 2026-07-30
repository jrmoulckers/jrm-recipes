import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

function Harness({
  onValueChange,
  initial = "a",
}: {
  onValueChange?: (value: string) => void;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ToggleGroup
      aria-label="Sample"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    >
      <ToggleGroupItem value="a">First</ToggleGroupItem>
      <ToggleGroupItem value="b">Second</ToggleGroupItem>
    </ToggleGroup>
  );
}

describe("ToggleGroup", () => {
  it("marks only the selected item as pressed", () => {
    render(<Harness initial="a" />);
    expect(screen.getByRole("button", { name: "First" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Second" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("exposes the group with its accessible label", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Sample" })).toBeInTheDocument();
  });

  it("selects a value when an item is clicked", () => {
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(screen.getByRole("button", { name: "Second" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not select when the item's own handler prevents default", () => {
    const onValueChange = vi.fn();
    render(
      <ToggleGroup aria-label="Guarded" value="a" onValueChange={onValueChange}>
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b" onClick={(e) => e.preventDefault()}>
          B
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("throws when an item is rendered outside a group", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      render(<ToggleGroupItem value="x">Orphan</ToggleGroupItem>),
    ).toThrow(/must be used within a <ToggleGroup>/);
    spy.mockRestore();
  });
});
