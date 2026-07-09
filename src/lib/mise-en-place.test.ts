import { describe, expect, it } from "vitest";

import {
  derivePrepTasks,
  groupIngredientsBySection,
  hasMiseEnPlace,
  type MiseIngredient,
} from "./mise-en-place";

function ing(overrides: Partial<MiseIngredient> = {}): MiseIngredient {
  return {
    id: "i-1",
    section: null,
    item: "onion",
    prep: null,
    optional: false,
    ...overrides,
  };
}

describe("groupIngredientsBySection", () => {
  it("groups by section, preserving first-seen section and item order", () => {
    const groups = groupIngredientsBySection([
      ing({ id: "a", section: "Sauce", item: "tomato" }),
      ing({ id: "b", section: null, item: "salt" }),
      ing({ id: "c", section: "Sauce", item: "basil" }),
      ing({ id: "d", section: "Garnish", item: "parsley" }),
    ]);

    expect(groups.map((g) => g.section)).toEqual(["Sauce", null, "Garnish"]);
    expect(groups[0]?.items.map((i) => i.item)).toEqual(["tomato", "basil"]);
    expect(groups[1]?.items.map((i) => i.item)).toEqual(["salt"]);
    expect(groups[2]?.items.map((i) => i.item)).toEqual(["parsley"]);
  });

  it("treats blank/whitespace sections as ungrouped", () => {
    const groups = groupIngredientsBySection([
      ing({ id: "a", section: "   ", item: "flour" }),
      ing({ id: "b", section: "", item: "sugar" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.section).toBeNull();
    expect(groups[0]?.items).toHaveLength(2);
  });

  it("returns an empty list for no ingredients", () => {
    expect(groupIngredientsBySection([])).toEqual([]);
  });
});

describe("derivePrepTasks", () => {
  it("keeps only ingredients with a non-empty prep note, in order", () => {
    const tasks = derivePrepTasks([
      ing({ id: "a", item: "onion", prep: "diced" }),
      ing({ id: "b", item: "salt", prep: null }),
      ing({ id: "c", item: "butter", prep: "  softened  " }),
      ing({ id: "d", item: "garlic", prep: "   " }),
    ]);

    expect(tasks).toEqual([
      { id: "a", item: "onion", prep: "diced", optional: false },
      { id: "c", item: "butter", prep: "softened", optional: false },
    ]);
  });

  it("carries the optional flag through", () => {
    const tasks = derivePrepTasks([
      ing({ id: "a", item: "chili", prep: "sliced", optional: true }),
    ]);
    expect(tasks[0]?.optional).toBe(true);
  });

  it("returns an empty list when nothing needs prep", () => {
    expect(derivePrepTasks([ing({ prep: null })])).toEqual([]);
  });
});

describe("hasMiseEnPlace", () => {
  it("is true only when there are ingredients", () => {
    expect(hasMiseEnPlace([])).toBe(false);
    expect(hasMiseEnPlace([ing()])).toBe(true);
  });
});
