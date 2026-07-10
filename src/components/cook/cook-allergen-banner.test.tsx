import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as React from "react";

import { CookAllergenBanner } from "./cook-allergen-banner";
import { type CookIngredient, type CookRecipe } from "./types";
import { IntlWrapper } from "~/test/intl";

function render(ui: React.ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

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
    householdId: null,
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

  it("carries the best-effort double-check disclaimer", () => {
    render(<CookAllergenBanner recipe={makeRecipe(["1 cup whole milk"])} />);
    expect(
      screen.getByText(/double-check labels and brands/i),
    ).toBeInTheDocument();
  });

  it("surfaces a hidden/derived allergen so it never gives a false all-clear", () => {
    // Worcestershire's fish (anchovy) is a hidden source with no direct allergen
    // in the name — the banner must still warn, under "may also contain".
    render(
      <CookAllergenBanner
        recipe={makeRecipe(["1 lb ground beef", "2 tsp worcestershire sauce"])}
      />,
    );
    const region = screen.getByRole("region", {
      name: /allergen safety check/i,
    });
    expect(region).toHaveTextContent(/may also contain/i);
    expect(region).toHaveTextContent(/Fish/);
  });

  it("can be acknowledged and dismissed", () => {
    render(<CookAllergenBanner recipe={makeRecipe(["1 cup shrimp"])} />);
    expect(
      screen.getByRole("region", { name: /allergen safety check/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(
      screen.queryByRole("region", { name: /allergen safety check/i }),
    ).not.toBeInTheDocument();
  });
});
