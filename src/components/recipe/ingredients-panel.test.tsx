import { cleanup, render as rtlRender } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { IntlWrapper } from "~/test/intl";
import {
  IngredientsPanel,
  type IngredientsPanelControls,
  type IngredientSuggestions,
} from "./ingredients-panel";

// Stub the lazy anchored-suggestions client bundle so we can assert the panel
// renders it itself from serializable data — the fix for the production RSC
// crash where a `renderSuggestions` function prop was passed across the
// Server -> Client boundary ("Functions cannot be passed directly to Client
// Components", digest 2500096145).
vi.mock("~/components/engagement/anchored-suggestions-lazy", () => ({
  AnchoredSuggestions: (props: {
    anchorId: string;
    anchorLabel: string;
    canInteract: boolean;
    suggestions: unknown[];
  }) => (
    <div
      data-testid="anchored-suggestions"
      data-anchor-id={props.anchorId}
      data-anchor-label={props.anchorLabel}
      data-can-interact={String(props.canInteract)}
      data-suggestion-count={String(props.suggestions.length)}
    />
  ),
}));

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

afterEach(cleanup);

const ingredients = [
  {
    id: "flour",
    section: null,
    quantity: 200,
    quantityMax: null,
    unit: "g",
    item: "flour",
    note: null,
    optional: false,
  },
  {
    id: "sugar",
    section: null,
    quantity: 100,
    quantityMax: null,
    unit: "g",
    item: "sugar",
    note: null,
    optional: false,
  },
];

function makeControls(checked: string[]): IngredientsPanelControls {
  return {
    servings: 4,
    onServingsChange: vi.fn(),
    system: "original",
    onSystemChange: vi.fn(),
    checked: new Set(checked),
    onToggleChecked: vi.fn(),
  };
}

const CHECK_ANIM = [
  "animate-check-box-pop",
  "animate-check-pop",
  "animate-strike-in",
] as const;

function hasCheckAnim(container: HTMLElement) {
  return CHECK_ANIM.some(
    (name) => container.querySelector(`[class*="${name}"]`) !== null,
  );
}

describe("IngredientsPanel check-off animation gating", () => {
  it("does not replay check-off motion for rows already checked on first paint", () => {
    // A resumed cook session hands the panel a pre-checked set on its very first
    // render (issue #88 regression).
    const { container } = render(
      <IngredientsPanel
        ingredients={ingredients}
        baseServings={4}
        servingsNoun={null}
        controls={makeControls(["flour"])}
      />,
    );

    // The row renders in its checked state...
    const pressed = container.querySelector('button[aria-pressed="true"]');
    expect(pressed).not.toBeNull();
    expect(pressed?.textContent).toContain("flour");

    // ...but none of the one-shot pop/strike animations fire on load.
    expect(hasCheckAnim(container)).toBe(false);
  });

  it("animates a row that actually flips checked after mount", () => {
    const { container, rerender } = rtlRender(
      <IntlWrapper>
        <IngredientsPanel
          ingredients={ingredients}
          baseServings={4}
          servingsNoun={null}
          controls={makeControls([])}
        />
      </IntlWrapper>,
    );

    // Nothing checked on first paint -> no animation.
    expect(hasCheckAnim(container)).toBe(false);

    // The user taps "flour": a live unchecked -> checked transition should animate.
    rerender(
      <IntlWrapper>
        <IngredientsPanel
          ingredients={ingredients}
          baseServings={4}
          servingsNoun={null}
          controls={makeControls(["flour"])}
        />
      </IntlWrapper>,
    );

    expect(hasCheckAnim(container)).toBe(true);
  });
});

describe("IngredientsPanel anchored suggestions (RSC boundary regression)", () => {
  it("renders AnchoredSuggestions per ingredient from serializable data", () => {
    const ingredientSuggestions: IngredientSuggestions = {
      recipeId: "rcp_1",
      recipeSlug: "test-recipe",
      canInteract: true,
      byIngredientId: {
        flour: [
          {
            id: "sug_1",
            anchorType: "ingredient",
            anchorId: "flour",
            anchorLabel: "flour",
            body: "Try bread flour",
            resolvedAt: null,
            appliedAt: null,
            createdAt: new Date(0),
            author: null,
          },
        ],
      },
    };

    // The payload must be JSON-serializable: this is exactly the invariant that
    // was violated when a render-prop function was passed across the boundary.
    expect(() => JSON.stringify(ingredientSuggestions)).not.toThrow();

    const { getAllByTestId } = render(
      <IngredientsPanel
        ingredients={ingredients}
        baseServings={4}
        servingsNoun={null}
        ingredientSuggestions={ingredientSuggestions}
      />,
    );

    const slots = getAllByTestId("anchored-suggestions");
    expect(slots).toHaveLength(ingredients.length);

    const flour = slots.find((el) => el.dataset.anchorId === "flour");
    expect(flour?.dataset.anchorLabel).toBe("flour");
    expect(flour?.dataset.canInteract).toBe("true");
    expect(flour?.dataset.suggestionCount).toBe("1");

    // Ingredients with no anchored suggestions still render the slot with an
    // empty list (preserves the "suggest an edit" affordance).
    const sugar = slots.find((el) => el.dataset.anchorId === "sugar");
    expect(sugar?.dataset.suggestionCount).toBe("0");
  });

  it("omits the suggestion slot entirely when no data is provided", () => {
    const { queryAllByTestId } = render(
      <IngredientsPanel
        ingredients={ingredients}
        baseServings={4}
        servingsNoun={null}
      />,
    );

    expect(queryAllByTestId("anchored-suggestions")).toHaveLength(0);
  });
});
