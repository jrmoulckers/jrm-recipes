import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CloseButton } from "./close-button";

afterEach(cleanup);

describe("CloseButton", () => {
  it("exposes the required label as its accessible name", () => {
    render(<CloseButton label="Dismiss" />);
    expect(
      screen.getByRole("button", { name: "Dismiss" }),
    ).toBeInTheDocument();
  });

  it("defaults to type=button so it never submits a form", () => {
    render(<CloseButton label="Dismiss" />);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("pins its own compact box at the inline sm size", () => {
    render(<CloseButton label="Remove" size="sm" />);
    expect(screen.getByRole("button").className).toContain("min-h-6");
  });

  it("renders a custom child icon in place of the default X", () => {
    render(
      <CloseButton label="Removing">
        <svg data-testid="spinner" />
      </CloseButton>,
    );
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("forwards clicks", () => {
    const onClick = vi.fn();
    render(<CloseButton label="Dismiss" onClick={onClick} />);
    screen.getByRole("button").click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
