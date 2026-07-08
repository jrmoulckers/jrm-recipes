import { describe, expect, it } from "vitest";

import {
  ingredientInput,
  recipeInput,
  recipeSlug,
  stepInput,
} from "./validation";

describe("recipeInput", () => {
  it("trims titles and fills recipe defaults", () => {
    expect(recipeInput.parse({ title: "  Sunday Sauce  " })).toMatchObject({
      title: "Sunday Sauce",
      visibility: "private",
      status: "draft",
      ingredients: [],
      steps: [],
      tags: [],
    });
  });

  it("coerces numeric form strings", () => {
    expect(
      recipeInput.parse({
        title: "Pancakes",
        servings: "4",
        prepMinutes: "10",
        cookMinutes: "20",
        totalMinutes: "30",
        ingredients: [{ item: "Flour", quantity: "1.5", quantityMax: "2" }],
        steps: [{ instruction: "Rest batter", timerSeconds: "120" }],
      }),
    ).toMatchObject({
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 20,
      totalMinutes: 30,
      ingredients: [{ item: "Flour", quantity: 1.5, quantityMax: 2 }],
      steps: [{ instruction: "Rest batter", timerSeconds: 120 }],
    });
  });

  it("coerces empty optional form fields to undefined", () => {
    expect(
      recipeInput.parse({
        title: "Pie",
        description: "",
        coverImageUrl: "",
        servingsNoun: "",
        sourceUrl: "",
        groupId: "",
        ingredients: [
          {
            section: "",
            quantity: "",
            unit: "",
            item: " Apples ",
            note: "",
          },
        ],
        steps: [
          {
            section: "",
            instruction: " Mix filling ",
            imageUrl: "",
            videoUrl: "",
            timerSeconds: "",
          },
        ],
      }),
    ).toMatchObject({
      title: "Pie",
      description: undefined,
      coverImageUrl: undefined,
      servingsNoun: undefined,
      sourceUrl: undefined,
      groupId: undefined,
      ingredients: [
        {
          section: undefined,
          quantity: undefined,
          unit: undefined,
          item: "Apples",
          note: undefined,
          optional: false,
        },
      ],
      steps: [
        {
          section: undefined,
          instruction: "Mix filling",
          imageUrl: undefined,
          videoUrl: undefined,
          timerSeconds: undefined,
          techniques: [],
        },
      ],
    });
  });

  it("rejects empty titles and out-of-range numbers", () => {
    expect(() => recipeInput.parse({ title: " " })).toThrow(
      /Give your recipe a title/,
    );
    expect(() =>
      recipeInput.parse({ title: "Too Much", servings: "1001" }),
    ).toThrow();
  });

  describe("group visibility requires a group (rc09)", () => {
    it("rejects visibility=group with no groupId and flags the field", () => {
      const res = recipeInput.safeParse({
        title: "Family Stew",
        visibility: "group",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.groupId).toBeDefined();
      }
    });

    it("rejects visibility=group with an empty groupId", () => {
      expect(
        recipeInput.safeParse({
          title: "Family Stew",
          visibility: "group",
          groupId: "",
        }).success,
      ).toBe(false);
    });

    it("accepts visibility=group when a groupId is provided", () => {
      expect(
        recipeInput.safeParse({
          title: "Family Stew",
          visibility: "group",
          groupId: "grp_123",
        }).success,
      ).toBe(true);
    });
  });

  describe("per-serving nutrition (i414)", () => {
    it("coerces nutrition form strings to numbers", () => {
      expect(
        recipeInput.parse({
          title: "Roast Chicken",
          calories: "540",
          proteinGrams: "42.5",
          carbsGrams: "3",
          fatGrams: "38",
          saturatedFatGrams: "11.2",
          sodiumMg: "620",
          sugarGrams: "1.5",
          fiberGrams: "0.5",
        }),
      ).toMatchObject({
        calories: 540,
        proteinGrams: 42.5,
        carbsGrams: 3,
        fatGrams: 38,
        saturatedFatGrams: 11.2,
        sodiumMg: 620,
        sugarGrams: 1.5,
        fiberGrams: 0.5,
      });
    });

    it("leaves blank nutrition fields undefined", () => {
      const parsed = recipeInput.parse({
        title: "No Numbers",
        calories: "",
        proteinGrams: "",
        sodiumMg: "",
      });
      expect(parsed.calories).toBeUndefined();
      expect(parsed.proteinGrams).toBeUndefined();
      expect(parsed.sodiumMg).toBeUndefined();
    });

    it("rejects negative and non-integer energy/sodium values", () => {
      expect(() =>
        recipeInput.parse({ title: "Bad", calories: "-1" }),
      ).toThrow();
      expect(() =>
        recipeInput.parse({ title: "Bad", sodiumMg: "-5" }),
      ).toThrow();
      expect(() =>
        recipeInput.parse({ title: "Bad", calories: "12.5" }),
      ).toThrow();
    });

    it("rejects out-of-range macronutrients", () => {
      expect(() =>
        recipeInput.parse({ title: "Bad", proteinGrams: "-2" }),
      ).toThrow();
      expect(() =>
        recipeInput.parse({ title: "Bad", fatGrams: "100001" }),
      ).toThrow();
    });
  });
});

describe("ingredientInput", () => {
  it("fills ingredient defaults", () => {
    expect(ingredientInput.parse({ item: " Salt " })).toMatchObject({
      item: "Salt",
      optional: false,
    });
  });

  it("rejects empty item text and invalid quantities", () => {
    expect(() => ingredientInput.parse({ item: " " })).toThrow(
      /Ingredient is required/,
    );
    expect(() => ingredientInput.parse({ item: "Salt", quantity: "100001" })).toThrow();
  });
});

describe("stepInput", () => {
  it("trims instructions and defaults techniques", () => {
    expect(stepInput.parse({ instruction: " Fold gently " })).toMatchObject({
      instruction: "Fold gently",
      techniques: [],
    });
  });

  it("rejects empty instructions and out-of-range timers", () => {
    expect(() => stepInput.parse({ instruction: " " })).toThrow(
      /Step text is required/,
    );
    expect(() =>
      stepInput.parse({ instruction: "Wait", timerSeconds: "86401" }),
    ).toThrow();
  });
});

describe("recipeSlug", () => {
  it("builds a sensible recipe slug", () => {
    expect(recipeSlug("Grandma's Pie!")).toBe("grandmas-pie");
    expect(recipeSlug("!!!")).toBe("recipe");
  });
});
