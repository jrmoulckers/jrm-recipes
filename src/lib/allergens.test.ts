import { describe, expect, it } from "vitest";

import {
  ALLERGENS,
  ALLERGEN_LABELS,
  detectAllergenHits,
  detectAllergens,
  detectAllergensForSafety,
  detectHiddenAllergens,
  summarizeAllergens,
  summarizeAllergensForSafety,
  summarizeHiddenAllergens,
  type Allergen,
} from "./allergens";

describe("detectAllergens — direct positives", () => {
  it("detects the major allergen groups from common ingredients", () => {
    expect(detectAllergens("peanuts")).toEqual(["peanut"]);
    expect(detectAllergens("chopped almonds")).toEqual(["tree-nut"]);
    expect(detectAllergens("whole milk")).toEqual(["dairy"]);
    expect(detectAllergens("2 large eggs")).toEqual(["egg"]);
    expect(detectAllergens("firm tofu")).toEqual(["soy"]);
    expect(detectAllergens("all-purpose flour")).toEqual(["wheat"]);
    expect(detectAllergens("salmon fillet")).toEqual(["fish"]);
    expect(detectAllergens("jumbo shrimp")).toEqual(["shellfish"]);
    expect(detectAllergens("tahini")).toEqual(["sesame"]);
  });

  it("ignores descriptors, quantities, and prep notes around the ingredient", () => {
    expect(detectAllergens("1 cup unsalted butter, softened")).toEqual([
      "dairy",
    ]);
    expect(detectAllergens("2 tbsp toasted sesame seeds")).toEqual(["sesame"]);
    expect(detectAllergens("Grated Parmigiano-Reggiano")).toEqual(["dairy"]);
  });

  it("covers all nine groups across a realistic recipe", () => {
    const items = [
      "peanut butter",
      "cashews",
      "heavy cream",
      "egg yolks",
      "soy sauce",
      "bread flour",
      "cod",
      "lobster",
      "sesame oil",
    ];
    expect(summarizeAllergens(items)).toEqual([...ALLERGENS]);
  });
});

describe("detectAllergens — whole-word matching avoids false positives", () => {
  it("does not match allergen substrings inside longer words", () => {
    expect(detectAllergens("eggplant")).toEqual([]); // not egg
    expect(detectAllergens("shellfish stock")).toEqual(["shellfish"]); // not fish
    expect(detectAllergens("buckwheat groats")).toEqual([]); // not wheat
    expect(detectAllergens("butternut squash")).toEqual([]); // not butter/nut
    expect(detectAllergens("nutmeg")).toEqual([]); // not tree-nut
  });

  it("treats peanut butter as peanut only — never dairy", () => {
    expect(detectAllergens("peanut butter")).toEqual(["peanut"]);
    expect(detectAllergens("creamy peanut butter")).toEqual(["peanut"]);
  });

  it("reads plant milks as their plant source, not dairy", () => {
    expect(detectAllergens("almond milk")).toEqual(["tree-nut"]);
    expect(detectAllergens("soy milk")).toEqual(["soy"]);
    expect(detectAllergens("oat milk")).toEqual([]);
    expect(detectAllergens("coconut cream")).toEqual([]);
  });

  it("reads non-wheat flours by their grain/nut, not wheat", () => {
    expect(detectAllergens("almond flour")).toEqual(["tree-nut"]);
    expect(detectAllergens("rice noodles")).toEqual([]);
    expect(detectAllergens("corn tortilla")).toEqual([]);
    expect(detectAllergens("gluten-free flour")).toEqual([]);
  });

  it("does not treat non-dairy butters/spreads as dairy", () => {
    expect(detectAllergens("cashew butter")).toEqual(["tree-nut"]);
    expect(detectAllergens("cocoa butter")).toEqual([]);
    expect(detectAllergens("apple butter")).toEqual([]);
    expect(detectAllergens("cream of tartar")).toEqual([]);
  });

  it("does not treat egg substitutes as egg", () => {
    expect(detectAllergens("flax egg")).toEqual([]);
    expect(detectAllergens("egg replacer")).toEqual([]);
    expect(detectAllergens("vegan mayo")).toEqual([]);
  });

  it("does not treat water chestnut as a tree nut", () => {
    expect(detectAllergens("water chestnuts")).toEqual([]);
    expect(detectAllergens("roasted chestnuts")).toEqual(["tree-nut"]);
  });

  it("documents the coconut choice: coconut is not flagged as tree-nut", () => {
    expect(detectAllergens("shredded coconut")).toEqual([]);
    expect(detectAllergens("coconut oil")).toEqual([]);
  });
});

describe("detectAllergens — multi-allergen ingredients", () => {
  it("returns every distinct allergen for a compound ingredient", () => {
    // egg noodles carry both egg and wheat
    expect(detectAllergens("egg noodles")).toEqual(["egg", "wheat"]);
  });

  it("returns an empty list for allergen-free ingredients", () => {
    expect(detectAllergens("olive oil")).toEqual([]);
    expect(detectAllergens("kosher salt")).toEqual([]);
    expect(detectAllergens("fresh basil")).toEqual([]);
    expect(detectAllergens("")).toEqual([]);
    expect(detectAllergens(null)).toEqual([]);
    expect(detectAllergens(undefined)).toEqual([]);
  });
});

describe("summarizeAllergens", () => {
  it("de-duplicates across ingredients and sorts in canonical order", () => {
    const items = ["cheddar cheese", "eggs", "butter", "milk"];
    // dairy appears three times, egg once → deduped, canonical order
    expect(summarizeAllergens(items)).toEqual(["dairy", "egg"]);
  });

  it("is stable regardless of input ordering", () => {
    const a = summarizeAllergens(["shrimp", "flour", "almonds"]);
    const b = summarizeAllergens(["almonds", "shrimp", "flour"]);
    expect(a).toEqual(b);
    expect(a).toEqual(["tree-nut", "wheat", "shellfish"]);
  });

  it("returns [] when nothing is detected", () => {
    expect(summarizeAllergens(["water", "sugar", "olive oil"])).toEqual([]);
  });
});

describe("metadata", () => {
  it("has a label for every allergen", () => {
    for (const allergen of ALLERGENS) {
      expect(ALLERGEN_LABELS[allergen]).toBeTruthy();
    }
  });

  it("detectAllergenHits marks direct matches as not hidden", () => {
    const hits = detectAllergenHits("whole milk");
    expect(hits).toContainEqual({
      allergen: "dairy" satisfies Allergen,
      hidden: false,
      note: undefined,
    });
  });
});

describe("detectHiddenAllergens — derived / hidden sources", () => {
  it("flags wheat hidden inside soy sauce", () => {
    const warnings = detectHiddenAllergens("soy sauce");
    const wheat = warnings.find((w) => w.allergen === "wheat");
    expect(wheat).toBeDefined();
    expect(wheat?.note).toBeTruthy();
  });

  it("flags fish hidden inside worcestershire sauce", () => {
    const allergens = detectHiddenAllergens("worcestershire sauce").map(
      (w) => w.allergen,
    );
    expect(allergens).toContain("fish");
  });

  it("flags tree nuts and dairy hidden inside pesto", () => {
    const allergens = detectHiddenAllergens("basil pesto").map(
      (w) => w.allergen,
    );
    expect(allergens).toContain("tree-nut");
    expect(allergens).toContain("dairy");
  });

  it("returns nothing for a plain ingredient", () => {
    expect(detectHiddenAllergens("carrot")).toEqual([]);
  });
});

describe("summarizeHiddenAllergens", () => {
  it("excludes allergens already declared directly", () => {
    // Wheat flour makes wheat a *direct* allergen, so soy sauce's hidden
    // wheat should not be surfaced again as a hidden warning.
    const hidden = summarizeHiddenAllergens([
      "all-purpose flour",
      "soy sauce",
    ]).map((w) => w.allergen);
    expect(hidden).not.toContain("wheat");
  });

  it("surfaces a hidden allergen when it is not otherwise present", () => {
    const hidden = summarizeHiddenAllergens(["chicken", "soy sauce"]).map(
      (w) => w.allergen,
    );
    expect(hidden).toContain("wheat");
  });

  it("de-duplicates and sorts hidden warnings in canonical order", () => {
    const hidden = summarizeHiddenAllergens([
      "soy sauce",
      "teriyaki glaze",
      "basil pesto",
    ]);
    const allergens = hidden.map((w) => w.allergen);
    // No duplicates.
    expect(new Set(allergens).size).toBe(allergens.length);
    // Canonical (ALLERGENS index) order, not alphabetical.
    const indices = allergens.map((a) => ALLERGENS.indexOf(a));
    expect(indices).toEqual([...indices].sort((x, y) => x - y));
  });
});

describe("detectAllergensForSafety — conservative direct+hidden union (#383/#405)", () => {
  it("counts a hidden source against personal safety (soy sauce → wheat)", () => {
    // The neutral "Contains" detector hides the derived wheat; the personal
    // safety detector must NOT — a wheat-allergic member is unsafe with it.
    expect(detectAllergens("soy sauce")).not.toContain("wheat");
    expect(detectAllergensForSafety("soy sauce")).toContain("wheat");
    // Soy is still there directly.
    expect(detectAllergensForSafety("soy sauce")).toContain("soy");
  });

  it("counts anchovies hidden in Worcestershire as fish", () => {
    expect(detectAllergens("worcestershire sauce")).not.toContain("fish");
    expect(detectAllergensForSafety("worcestershire sauce")).toContain("fish");
  });

  it("is empty for a plainly safe ingredient", () => {
    expect(detectAllergensForSafety("diced carrots")).toEqual([]);
  });
});

describe("summarizeAllergensForSafety — recipe-level union for 'safe for'", () => {
  it("makes a soy-sauce recipe unsafe for a wheat-allergic member", () => {
    const recipe = summarizeAllergensForSafety([
      "chicken thighs",
      "soy sauce",
      "green onion",
    ]);
    expect(recipe).toContain("wheat");
  });

  it("makes a Worcestershire recipe unsafe for a fish-allergic member", () => {
    const recipe = summarizeAllergensForSafety([
      "ground beef",
      "worcestershire sauce",
    ]);
    expect(recipe).toContain("fish");
  });

  it("surfaces pesto's pine nut + parmesan for tree-nut / dairy allergies", () => {
    const recipe = summarizeAllergensForSafety(["pasta base", "basil pesto"]);
    expect(recipe).toEqual(expect.arrayContaining(["tree-nut", "dairy"]));
  });

  it("stays canonically sorted and de-duplicated", () => {
    const recipe = summarizeAllergensForSafety(["soy sauce", "soy sauce"]);
    expect(new Set(recipe).size).toBe(recipe.length);
    const indices = recipe.map((a) => ALLERGENS.indexOf(a));
    expect(indices).toEqual([...indices].sort((x, y) => x - y));
  });
});
