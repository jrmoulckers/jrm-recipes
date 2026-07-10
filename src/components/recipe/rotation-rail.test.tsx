import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RotationRail } from "./rotation-rail";
import { type CardRecipe } from "./recipe-card";

// Stub the heavy client children so the test focuses on the rail's own wiring
// (Cook link + add-to-plan action) without pulling in server actions / env.
vi.mock("./recipe-card", () => ({
  RecipeCard: ({ recipe }: { recipe: { title: string } }) => (
    <div data-testid="card">{recipe.title}</div>
  ),
}));
vi.mock("./quick-plan-button", () => ({
  QuickPlanButton: ({ recipeId }: { recipeId: string }) => (
    <button type="button">plan {recipeId}</button>
  ),
}));

afterEach(cleanup);

const recipes = [
  { id: "r1", slug: "tacos", title: "Taco night" },
  { id: "r2", slug: "pasta", title: "Weeknight pasta" },
] as unknown as CardRecipe[];

const quickPlan = {
  days: [{ value: "2026-07-06", label: "Mon, Jul 6" }],
  defaultDate: "2026-07-06",
};

describe("RotationRail (#426)", () => {
  it("renders nothing when there are no recipes", () => {
    const { container } = render(
      <RotationRail recipes={[]} quickPlan={quickPlan} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a Cook link and add-to-plan action per favorite", () => {
    render(<RotationRail recipes={recipes} quickPlan={quickPlan} />);

    expect(
      screen.getByRole("heading", { name: /back in the rotation/i }),
    ).toBeInTheDocument();

    const cookLinks = screen.getAllByRole("link", { name: /cook/i });
    expect(cookLinks.map((a) => a.getAttribute("href"))).toEqual([
      "/recipes/tacos/cook",
      "/recipes/pasta/cook",
    ]);

    expect(screen.getByRole("button", { name: "plan r1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "plan r2" })).toBeInTheDocument();
  });

  it("omits the add-to-plan action when quick-plan is unavailable", () => {
    render(<RotationRail recipes={recipes} quickPlan={null} />);
    expect(
      screen.queryByRole("button", { name: /^plan / }),
    ).not.toBeInTheDocument();
    // Cook is still offered.
    expect(screen.getAllByRole("link", { name: /cook/i })).toHaveLength(2);
  });
});
