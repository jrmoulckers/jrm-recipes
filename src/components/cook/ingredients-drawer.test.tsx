import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IngredientsDrawer } from "./ingredients-drawer";

afterEach(cleanup);

const recipe = {
  ingredients: [],
  servings: 4,
  servingsNoun: null,
  nutrition: {},
} as const;

describe("IngredientsDrawer trigger name (issue #120)", () => {
  it("exposes one stable accessible name at every breakpoint", () => {
    render(<IngredientsDrawer recipe={recipe} />);

    const trigger = screen.getByRole("button", {
      name: /ingredients list and recipe scaling/i,
    });
    const name = trigger.getAttribute("aria-label") ?? "";

    // Label-in-name (2.5.3): both responsive visible words ("Ingredients" on
    // desktop, "List" on mobile) are substrings of the single stable name, so
    // the accessible name never changes with the viewport.
    expect(name.toLowerCase()).toContain("ingredients");
    expect(name.toLowerCase()).toContain("list");
  });

  it("keeps the icon decorative so it does not double-announce", () => {
    render(<IngredientsDrawer recipe={recipe} />);
    const trigger = screen.getByRole("button", {
      name: /ingredients list and recipe scaling/i,
    });
    expect(trigger.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the custom label while staying inside the accessible name", () => {
    render(<IngredientsDrawer recipe={recipe} label="Shopping" />);
    const trigger = screen.getByRole("button", {
      name: "Shopping list and recipe scaling",
    });
    expect(trigger).toBeInTheDocument();
  });
});
