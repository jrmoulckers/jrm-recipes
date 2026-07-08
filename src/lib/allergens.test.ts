import { describe, expect, it } from "vitest";

import {
  ALLERGENS,
  ALLERGEN_LABELS,
  detectAllergenHits,
  detectAllergens,
  summarizeAllergens,
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
