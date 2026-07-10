import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button } from "./button";
import { EmptyState } from "./empty-state";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renders icon, title, description, and action slots", () => {
    render(
      <EmptyState
        icon={<svg data-testid="icon" />}
        title="No recipes yet"
        description="Add your first recipe to get started."
        action={<Button>Add recipe</Button>}
      />,
    );

    const heading = screen.getByRole("heading", { name: "No recipes yet" });
    expect(heading.className).toContain("font-display");
    expect(
      screen.getByText("Add your first recipe to get started."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add recipe" }),
    ).toBeInTheDocument();
    // Decorative icon is hidden from assistive tech.
    const iconWrap = screen.getByTestId("icon").parentElement;
    expect(iconWrap?.getAttribute("aria-hidden")).toBe("true");
  });

  it("uses semantic tokens and a constrained measure for the description", () => {
    render(<EmptyState title="Empty" description="Some copy" />);
    const desc = screen.getByText("Some copy");
    expect(desc.className).toContain("text-muted-foreground");
    expect(desc.className).toContain("max-w-md");
    expect(desc.className).not.toMatch(/text-(?:white|black|gray-\d)/);
  });

  it("applies compact spacing for the compact variant", () => {
    const { container } = render(
      <EmptyState variant="compact" title="Empty" />,
    );
    const root = container.firstElementChild;
    expect(root?.className).toContain("py-8");
    expect(root?.className).not.toContain("border-dashed");
  });

  it("defaults to a bordered surface panel", () => {
    const { container } = render(<EmptyState title="Empty" />);
    const root = container.firstElementChild;
    expect(root?.className).toContain("border-dashed");
    expect(root?.className).toContain("bg-surface/50");
    expect(root?.className).toContain("text-center");
  });
});
