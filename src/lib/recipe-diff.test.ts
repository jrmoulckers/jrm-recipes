import { describe, expect, it } from "vitest";

import {
  diffRecipeSnapshots,
  formatIngredientLine,
  formatStepLine,
} from "./recipe-diff";
import type { RecipeInput } from "~/server/recipes/validation";

function recipe(overrides: Partial<RecipeInput> = {}): RecipeInput {
  return {
    title: "Test",
    ingredients: [],
    steps: [],
    tags: [],
    equipment: [],
    dietaryFlags: [],
    visibility: "private",
    status: "draft",
    ...overrides,
  } as RecipeInput;
}

function ing(item: string, extra: Record<string, unknown> = {}) {
  return { item, optional: false, ...extra } as RecipeInput["ingredients"][number];
}

function step(instruction: string, extra: Record<string, unknown> = {}) {
  return { instruction, techniques: [], ...extra } as RecipeInput["steps"][number];
}

describe("formatIngredientLine", () => {
  it("renders quantity, unit and item", () => {
    expect(formatIngredientLine(ing("flour", { quantity: 2, unit: "cup" }))).toBe(
      "2 cup flour",
    );
  });

  it("renders a quantity range", () => {
    expect(
      formatIngredientLine(ing("water", { quantity: 1, quantityMax: 2, unit: "cup" })),
    ).toBe("1–2 cup water");
  });

  it("appends prep, note and optional marker", () => {
    expect(
      formatIngredientLine(
        ing("onion", { quantity: 1, prep: "diced", note: "yellow", optional: true }),
      ),
    ).toBe("1 onion (diced, yellow) · optional");
  });
});

describe("formatStepLine", () => {
  it("prefixes the section when present", () => {
    expect(formatStepLine(step("Mix well", { section: "Dough" }))).toBe(
      "Dough: Mix well",
    );
  });
});

describe("diffRecipeSnapshots", () => {
  it("reports no changes for identical snapshots", () => {
    const r = recipe({
      ingredients: [ing("flour", { quantity: 2, unit: "cup" })],
      steps: [step("Bake")],
    });
    const diff = diffRecipeSnapshots(r, r);
    expect(diff.identical).toBe(true);
    expect(diff.summary).toEqual({ changed: 0, added: 0, removed: 0 });
    expect(diff.fields).toHaveLength(0);
  });

  it("detects scalar field changes", () => {
    const before = recipe({ title: "Cake", servings: 4 });
    const after = recipe({ title: "Big Cake", servings: 8 });
    const diff = diffRecipeSnapshots(before, after);
    const keys = diff.fields.map((f) => f.key);
    expect(keys).toContain("title");
    expect(keys).toContain("servings");
    const title = diff.fields.find((f) => f.key === "title");
    expect(title?.before).toBe("Cake");
    expect(title?.after).toBe("Big Cake");
    expect(diff.identical).toBe(false);
  });

  it("detects added, removed and changed ingredient lines", () => {
    const before = recipe({
      ingredients: [
        ing("flour", { quantity: 2, unit: "cup" }),
        ing("sugar", { quantity: 1, unit: "cup" }),
      ],
    });
    const after = recipe({
      ingredients: [
        ing("flour", { quantity: 3, unit: "cup" }), // changed
        ing("egg", { quantity: 2 }), // added
      ],
    });
    const diff = diffRecipeSnapshots(before, after);
    expect(diff.ingredients.changed).toBe(1);
    expect(diff.ingredients.added).toBe(1);
    expect(diff.ingredients.removed).toBe(1);
    const changed = diff.ingredients.lines.find((l) => l.kind === "changed");
    expect(changed?.before).toBe("2 cup flour");
    expect(changed?.after).toBe("3 cup flour");
  });

  it("detects step edits", () => {
    const before = recipe({ steps: [step("Mix"), step("Bake for 20 min")] });
    const after = recipe({ steps: [step("Mix"), step("Bake for 30 min")] });
    const diff = diffRecipeSnapshots(before, after);
    expect(diff.steps.changed).toBe(1);
    expect(diff.steps.lines.filter((l) => l.kind === "unchanged")).toHaveLength(1);
  });

  it("treats a null (legacy/empty) snapshot as an empty recipe without crashing", () => {
    const after = recipe({
      title: "New",
      ingredients: [ing("salt")],
      steps: [step("Season")],
    });
    const diff = diffRecipeSnapshots(null, after);
    expect(diff.ingredients.added).toBe(1);
    expect(diff.steps.added).toBe(1);
    expect(diff.fields.some((f) => f.key === "title")).toBe(true);
    expect(() => diffRecipeSnapshots(null, null)).not.toThrow();
    expect(diffRecipeSnapshots(null, null).identical).toBe(true);
  });

  it("handles snapshots of differing length", () => {
    const before = recipe({ ingredients: [ing("a"), ing("b"), ing("c")] });
    const after = recipe({ ingredients: [ing("a")] });
    const diff = diffRecipeSnapshots(before, after);
    expect(diff.ingredients.removed).toBe(2);
    expect(diff.ingredients.added).toBe(0);
  });
});
