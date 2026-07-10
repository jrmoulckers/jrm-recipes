import { describe, expect, it } from "vitest";

import {
  allergenConflicts,
  detectIngredientConflict,
  hasAllergenConflict,
  isIngredientConflict,
  isRecipeSafeFor,
  meetsDiets,
  safeSubstitutions,
  type MemberNeeds,
} from "./dietary-match";
import { type Substitution } from "./substitutions";

describe("hasAllergenConflict", () => {
  it("is false when the member avoids nothing", () => {
    expect(hasAllergenConflict([], ["peanut", "dairy"])).toBe(false);
  });

  it("is true when the recipe carries an avoided allergen", () => {
    expect(hasAllergenConflict(["peanut"], ["dairy", "peanut"])).toBe(true);
  });

  it("is false when none of the avoided allergens are present", () => {
    expect(hasAllergenConflict(["shellfish"], ["dairy", "wheat"])).toBe(false);
  });
});

describe("meetsDiets", () => {
  it("is satisfied when the member follows no diet", () => {
    expect(meetsDiets([], [])).toBe(true);
    expect(meetsDiets([], ["vegan"])).toBe(true);
  });

  it("requires the recipe to declare every diet the member follows", () => {
    expect(meetsDiets(["vegan"], ["vegan", "gluten-free"])).toBe(true);
    expect(meetsDiets(["vegan", "gluten-free"], ["vegan"])).toBe(false);
  });

  it("fails closed when the recipe declares no flags", () => {
    expect(meetsDiets(["vegetarian"], [])).toBe(false);
  });
});

describe("isRecipeSafeFor", () => {
  const nutAllergicVegan: MemberNeeds = {
    allergens: ["peanut", "tree-nut"],
    diets: ["vegan"],
  };

  it("is safe when no allergen conflicts and all diets are met", () => {
    expect(
      isRecipeSafeFor(nutAllergicVegan, {
        allergens: ["soy"],
        dietaryFlags: ["vegan", "gluten-free"],
      }),
    ).toBe(true);
  });

  it("is unsafe when an avoided allergen is present, even if the diet matches", () => {
    expect(
      isRecipeSafeFor(nutAllergicVegan, {
        allergens: ["peanut"],
        dietaryFlags: ["vegan"],
      }),
    ).toBe(false);
  });

  it("is unsafe when the diet isn't declared, even with no allergen conflict", () => {
    expect(
      isRecipeSafeFor(nutAllergicVegan, {
        allergens: [],
        dietaryFlags: [],
      }),
    ).toBe(false);
  });

  it("treats a member with no restrictions as safe for anything", () => {
    expect(
      isRecipeSafeFor(
        { allergens: [], diets: [] },
        { allergens: ["peanut", "dairy"], dietaryFlags: [] },
      ),
    ).toBe(true);
  });
});

describe("allergenConflicts", () => {
  it("returns nothing when the member avoids nothing", () => {
    expect(allergenConflicts([], ["peanut", "dairy"])).toEqual([]);
  });

  it("returns the avoided allergens the recipe carries, in member order", () => {
    expect(
      allergenConflicts(["dairy", "peanut"], ["peanut", "soy", "dairy"]),
    ).toEqual(["dairy", "peanut"]);
  });

  it("returns nothing when there is no overlap", () => {
    expect(allergenConflicts(["shellfish"], ["dairy", "wheat"])).toEqual([]);
  });
});

describe("detectIngredientConflict", () => {
  const dairyFreeVegan: MemberNeeds = {
    allergens: [],
    diets: ["dairy-free", "vegan"],
  };

  it("flags a diet violation and suggests the neutralizing tag", () => {
    // "butter" → dairy; conflicts with both dairy-free and vegan.
    const conflict = detectIngredientConflict(["dairy"], dairyFreeVegan);
    expect(conflict.allergens).toEqual([]);
    expect(conflict.diets).toEqual(["dairy-free", "vegan"]);
    expect(conflict.suggestedTags).toContain("dairy-free");
    expect(isIngredientConflict(conflict)).toBe(true);
  });

  it("flags a raw allergen and maps it to a -free swap tag", () => {
    const conflict = detectIngredientConflict(["wheat"], {
      allergens: ["wheat"],
      diets: [],
    });
    expect(conflict.allergens).toEqual(["wheat"]);
    expect(conflict.diets).toEqual([]);
    expect(conflict.suggestedTags).toEqual(["gluten-free"]);
  });

  it("does not flag an allergen the member doesn't avoid", () => {
    const conflict = detectIngredientConflict(["soy"], dairyFreeVegan);
    expect(isIngredientConflict(conflict)).toBe(false);
    expect(conflict.suggestedTags).toEqual([]);
  });

  it("suggests no tag for an allergen with no matching diet (e.g. peanut)", () => {
    const conflict = detectIngredientConflict(["peanut"], {
      allergens: ["peanut"],
      diets: [],
    });
    expect(conflict.allergens).toEqual(["peanut"]);
    expect(conflict.suggestedTags).toEqual([]);
    expect(isIngredientConflict(conflict)).toBe(true);
  });
});

describe("safeSubstitutions (#429 safe-swap safety)", () => {
  // A dairy-free swap list that includes nut-based options — realistic for
  // "butter" or "cream". A dairy-allergic member who is ALSO nut-allergic must
  // not be shown the cashew/almond swaps as "safe".
  const dairySwaps: Substitution[] = [
    {
      substitute: "Olive oil",
      ratioOrNotes: "Use ¾ cup oil per cup of butter.",
      dietaryTags: ["dairy-free", "vegan"],
    },
    {
      substitute: "Cashew cream",
      ratioOrNotes: "Blend 1 cup soaked cashews with ½ cup water.",
      dietaryTags: ["dairy-free", "vegan"],
    },
    {
      substitute: "Almond milk + oil",
      ratioOrNotes: "1 cup almond milk whisked with 2 tbsp oil.",
      dietaryTags: ["dairy-free"],
    },
    {
      substitute: "Coconut oil",
      ratioOrNotes: "Swap 1:1 with solid coconut oil.",
      dietaryTags: ["dairy-free", "vegan"],
    },
  ];

  it("drops swaps that carry one of the member's other allergens", () => {
    const safe = safeSubstitutions(dairySwaps, ["tree-nut"]);
    const names = safe.map((s) => s.substitute);
    expect(names).not.toContain("Cashew cream");
    expect(names).not.toContain("Almond milk + oil");
    // Nut-free options survive (coconut is deliberately not treated as tree-nut).
    expect(names).toEqual(expect.arrayContaining(["Olive oil", "Coconut oil"]));
  });

  it("leaves the list untouched when the member avoids nothing", () => {
    expect(safeSubstitutions(dairySwaps, [])).toHaveLength(dairySwaps.length);
  });

  it("detects an avoided allergen mentioned only in the notes", () => {
    const swaps: Substitution[] = [
      {
        substitute: "Nut-free spread",
        ratioOrNotes: "A blend finished with a little peanut oil.",
      },
    ];
    expect(safeSubstitutions(swaps, ["peanut"])).toHaveLength(0);
  });
});
