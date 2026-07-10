import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { IngredientSubstitutions } from "./ingredient-substitutions";

afterEach(cleanup);

// "Mayonnaise" is a good fixture: two of its swaps are vegetarian and one
// ("Vegan mayo") is tagged egg-free/vegan/dairy-free, so dietary filters are
// observable in the rendered list.
async function openSubstitutions(item: string) {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<IngredientSubstitutions item={item} />);
  await user.click(screen.getByRole("button", { name: /substitutions for/i }));
  return user;
}

describe("IngredientSubstitutions dietary filters", () => {
  it("offers all five dietary filters, including egg-free and vegetarian", async () => {
    await openSubstitutions("mayonnaise");

    const group = await screen.findByRole("group", {
      name: /filter substitutions by dietary need/i,
    });
    const chipLabels = within(group)
      .getAllByRole("button")
      .map((chip) => chip.textContent);

    expect(chipLabels).toEqual([
      "Vegan",
      "Vegetarian",
      "Dairy-free",
      "Gluten-free",
      "Egg-free",
    ]);
  });

  it("narrows swaps to egg-free options when Egg-free is selected", async () => {
    const user = await openSubstitutions("mayonnaise");

    // All three swaps show before filtering.
    expect(await screen.findByText("Vegan mayo")).toBeInTheDocument();
    expect(screen.getByText("Plain Greek yogurt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Egg-free" }));

    // Only the egg-free swap survives; the egg-based ones drop out.
    expect(screen.getByText("Vegan mayo")).toBeInTheDocument();
    expect(screen.queryByText("Plain Greek yogurt")).not.toBeInTheDocument();
    expect(screen.queryByText("Sour cream")).not.toBeInTheDocument();
  });

  it("narrows swaps to vegetarian options when Vegetarian is selected", async () => {
    const user = await openSubstitutions("mayonnaise");

    await user.click(screen.getByRole("button", { name: "Vegetarian" }));

    expect(screen.getByText("Plain Greek yogurt")).toBeInTheDocument();
    // "Vegan mayo" is not tagged vegetarian, so it is filtered out.
    expect(screen.queryByText("Vegan mayo")).not.toBeInTheDocument();
  });
});

describe("IngredientSubstitutions allergen safety (#429)", () => {
  it("hides swaps that carry one of the member's allergens", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    // Cooking for a dairy-allergic member: the dairy-based mayo swaps must not
    // be offered as safe alternatives, even though they're valid swaps.
    render(
      <IngredientSubstitutions item="mayonnaise" avoidAllergens={["dairy"]} />,
    );
    await user.click(
      screen.getByRole("button", { name: /substitutions for/i }),
    );

    // The dairy-free swap survives; the dairy-carrying ones are filtered out.
    expect(await screen.findByText("Vegan mayo")).toBeInTheDocument();
    expect(screen.queryByText("Plain Greek yogurt")).not.toBeInTheDocument();
    expect(screen.queryByText("Sour cream")).not.toBeInTheDocument();
  });
});
