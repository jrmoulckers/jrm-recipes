import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NutritionPanel } from "./nutrition-panel";
import { type Nutrition } from "~/lib/nutrition";

afterEach(cleanup);

const PER_SERVING: Nutrition = {
  calories: 500,
  proteinGrams: 20,
  sodiumMg: 300,
};

describe("NutritionPanel", () => {
  it("renders per-serving values by default", () => {
    render(
      <NutritionPanel nutrition={PER_SERVING} servings={4} servingsNoun="servings" />,
    );
    const region = screen.getByRole("region", { name: /nutrition facts/i });
    expect(within(region).getByText(/amounts are per serving/i)).toBeInTheDocument();
    expect(within(region).getByText("500")).toBeInTheDocument();
  });

  it("multiplies to whole-recipe totals when toggled, using current servings", () => {
    render(<NutritionPanel nutrition={PER_SERVING} servings={4} />);
    fireEvent.click(screen.getByRole("button", { name: /whole recipe/i }));

    const region = screen.getByRole("region", { name: /nutrition facts/i });
    // 500 × 4 servings = 2,000 calories for the whole recipe.
    expect(within(region).getByText("2,000")).toBeInTheDocument();
    expect(within(region).getByText(/whole recipe ·/i)).toBeInTheDocument();
  });

  it("renders nothing when there is no nutrition data", () => {
    const { container } = render(
      <NutritionPanel nutrition={{ calories: null }} servings={4} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
