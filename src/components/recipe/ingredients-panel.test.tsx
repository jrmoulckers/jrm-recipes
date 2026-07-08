import { cleanup, render as rtlRender } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { IntlWrapper } from "~/test/intl";
import {
  IngredientsPanel,
  type IngredientsPanelControls,
} from "./ingredients-panel";

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
