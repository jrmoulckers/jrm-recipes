import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CookAllergenBanner } from "./cook-allergen-banner";
import { type CookIngredient, type CookRecipe } from "./types";

function ingredient(item: string, id: string): CookIngredient {
  return {
    id,
    position: 0,
    section: null,
    quantity: null,
    quantityMax: null,
    unit: null,
    item,
    note: null,
    optional: false,
  };
}

function makeRecipe(items: string[]): CookRecipe {
  return {
    id: "r1",
    slug: "r1",
    title: "Test",
    description: null,
    coverImageUrl: null,
    servings: null,
    servingsNoun: null,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    notes: null,
    nutrition: {},
    ingredients: items.map((item, i) => ingredient(item, `i${i}`)),
    steps: [],
  };
}

describe("CookAllergenBanner", () => {
  it("surfaces detected allergens on entry", () => {
    render(
      <CookAllergenBanner
        recipe={makeRecipe(["2 tbsp peanut butter", "1 cup whole milk"])}
      />,
    );
    const region = screen.getByRole("region", {
      name: /allergen safety check/i,
    });
    expect(region).toHaveTextContent(/this recipe contains/i);
    expect(region).toHaveTextContent(/Peanuts/);
    expect(region).toHaveTextContent(/Dairy/);
  });

  it("renders nothing when no allergens are detected", () => {
    const { container } = render(
      <CookAllergenBanner recipe={makeRecipe(["2 cups white rice", "salt"])} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("can be acknowledged and dismissed", () => {
    render(
      <CookAllergenBanner recipe={makeRecipe(["1 cup shrimp"])} />,
    );
    expect(
      screen.getByRole("region", { name: /allergen safety check/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(
      screen.queryByRole("region", { name: /allergen safety check/i }),
    ).not.toBeInTheDocument();
  });
});
