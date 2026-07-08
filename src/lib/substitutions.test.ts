import { describe, expect, it } from "vitest";

import {
  DIETARY_TAGS,
  DIETARY_TAG_LABELS,
  SUBSTITUTIONS,
  filterSubstitutionsByDiet,
  getSubstitutions,
  matchIngredient,
  matchIngredientDetailed,
  normalizeIngredient,
  orderSubstitutionsByDiet,
  scalingNudge,
  type DietaryTag,
  type Substitution,
} from "./substitutions";

describe("DIETARY_TAGS (i404 single source of truth)", () => {
  it("has a human label for every tag and no orphan labels", () => {
    expect(Object.keys(DIETARY_TAG_LABELS).sort()).toEqual(
      [...DIETARY_TAGS].sort(),
    );
  });

  it("contains no duplicates", () => {
    expect(new Set(DIETARY_TAGS).size).toBe(DIETARY_TAGS.length);
  });
});

describe("normalizeIngredient", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeIngredient("  Buttermilk  ")).toBe("buttermilk");
    expect(normalizeIngredient("Baking   Powder")).toBe("baking powder");
  });

  it("turns hyphens and punctuation into spaces", () => {
    expect(normalizeIngredient("all-purpose flour")).toBe("all purpose flour");
    expect(normalizeIngredient("half-and-half")).toBe("half and half");
  });

  it("strips accents", () => {
    expect(normalizeIngredient("Crème fraîche")).toBe("creme fraiche");
  });

  it("drops parentheticals and prep notes after a comma", () => {
    expect(normalizeIngredient("butter (softened)")).toBe("butter");
    expect(normalizeIngredient("eggs, beaten")).toBe("eggs");
    expect(normalizeIngredient("cilantro, onion, lime")).toBe("cilantro");
  });

  it("returns an empty string for nullish input", () => {
    expect(normalizeIngredient(null)).toBe("");
    expect(normalizeIngredient(undefined)).toBe("");
    expect(normalizeIngredient("")).toBe("");
  });
});

describe("matchIngredient", () => {
  it("matches exact staples", () => {
    expect(matchIngredient("buttermilk")?.name).toBe("Buttermilk");
    expect(matchIngredient("honey")?.name).toBe("Honey");
    expect(matchIngredient("cornstarch")?.name).toBe("Cornstarch");
  });

  it("ignores descriptors around the core ingredient", () => {
    expect(matchIngredient("large eggs")?.name).toBe("Egg");
    expect(matchIngredient("unsalted butter")?.name).toBe("Butter");
    expect(matchIngredient("yellow onion")?.name).toBe("Onion");
    expect(matchIngredient("garlic cloves")?.name).toBe("Garlic");
    expect(matchIngredient("fresh basil")?.name).toBe("Basil");
    expect(matchIngredient("dried oregano")?.name).toBe("Oregano");
  });

  it("prefers the most specific (longest) alias", () => {
    expect(matchIngredient("sour cream")?.name).toBe("Sour cream");
    expect(matchIngredient("heavy cream")?.name).toBe("Heavy cream");
    expect(matchIngredient("cream cheese")?.name).toBe("Cream cheese");
    expect(matchIngredient("self-rising flour")?.name).toBe("Self-rising flour");
    expect(matchIngredient("brown sugar")?.name).toBe("Brown sugar");
    expect(matchIngredient("cake flour")?.name).toBe("Cake flour");
  });

  it("falls back to the generic staple when no descriptor is special", () => {
    expect(matchIngredient("flour")?.name).toBe("All-purpose flour");
    expect(matchIngredient("2 cups flour")?.name).toBe("All-purpose flour");
    expect(matchIngredient("sugar")?.name).toBe("Granulated sugar");
    expect(matchIngredient("oil")?.name).toBe("Vegetable oil");
  });

  it("does not match milk inside buttermilk (whole-word only)", () => {
    expect(matchIngredient("buttermilk")?.name).toBe("Buttermilk");
    expect(matchIngredient("whole milk")?.name).toBe("Milk");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(matchIngredient("  BUTTERMILK ")?.name).toBe("Buttermilk");
    expect(matchIngredient("Large Eggs")?.name).toBe("Egg");
  });

  it("tolerates ingredients with no sensible match", () => {
    expect(matchIngredient("boneless chicken thighs")).toBeNull();
    expect(matchIngredient("water")).toBeNull();
    expect(matchIngredient("quinoa")).toBeNull();
    expect(matchIngredient("salt")).toBeNull();
    expect(matchIngredient("")).toBeNull();
    expect(matchIngredient(null)).toBeNull();
  });
});

describe("matchIngredientDetailed", () => {
  it("returns the matched entry with a score and confidence", () => {
    const match = matchIngredientDetailed("sour cream");

    expect(match?.entry.name).toBe("Sour cream");
    expect(match?.score).toBeGreaterThan(0);
    expect(match?.confidence).toBe("high");
  });

  it("derives confidence from alias specificity", () => {
    expect(matchIngredientDetailed("buttermilk")?.confidence).toBe("medium");
    expect(matchIngredientDetailed("oil")?.confidence).toBe("low");
    expect(matchIngredientDetailed("self-rising flour")?.confidence).toBe("high");
  });

  it("returns null for unmatched ingredients", () => {
    expect(matchIngredientDetailed("boneless chicken thighs")).toBeNull();
  });
});

describe("getSubstitutions", () => {
  it("returns the swap list for a matched ingredient", () => {
    const subs = getSubstitutions("buttermilk");
    expect(subs.length).toBeGreaterThan(0);
    const first = subs[0]!;
    expect(first.substitute).toBeTruthy();
    expect(first.ratioOrNotes).toContain("lemon juice");
  });

  it("surfaces dietary tags on relevant swaps", () => {
    const eggSwaps = getSubstitutions("2 large eggs");
    const vegan = eggSwaps.find((s) => s.dietaryTags?.includes("vegan"));
    expect(vegan).toBeDefined();
    expect(vegan?.dietaryTags).toContain("egg-free");
  });

  it("offers a gluten-free flour option", () => {
    const glutenFree = getSubstitutions("all-purpose flour").find((s) =>
      s.dietaryTags?.includes("gluten-free"),
    );
    expect(glutenFree).toBeDefined();
  });

  it("returns an empty array for an unmatched ingredient", () => {
    expect(getSubstitutions("boneless chicken thighs")).toEqual([]);
    expect(getSubstitutions(null)).toEqual([]);
  });

  it("filters substitutions by required dietary tags", () => {
    const veganButterSwaps = getSubstitutions("butter", ["vegan"]);

    expect(veganButterSwaps.length).toBeGreaterThan(0);
    expect(
      veganButterSwaps.every((sub) => sub.dietaryTags?.includes("vegan")),
    ).toBe(true);
  });

  it("filters to egg-free swaps for an egg-allergy cook", () => {
    const eggFreeMayoSwaps = getSubstitutions("mayonnaise", ["egg-free"]);

    expect(eggFreeMayoSwaps.length).toBeGreaterThan(0);
    expect(
      eggFreeMayoSwaps.every((sub) => sub.dietaryTags?.includes("egg-free")),
    ).toBe(true);
    // The egg-free "Vegan mayo" swap survives; the egg-based options do not.
    expect(eggFreeMayoSwaps.map((sub) => sub.substitute)).toContain(
      "Vegan mayo",
    );
    expect(eggFreeMayoSwaps.map((sub) => sub.substitute)).not.toContain(
      "Plain Greek yogurt",
    );
  });

  it("filters to vegetarian swaps", () => {
    const vegetarianMayoSwaps = getSubstitutions("mayonnaise", ["vegetarian"]);

    expect(vegetarianMayoSwaps.length).toBeGreaterThan(0);
    expect(
      vegetarianMayoSwaps.every((sub) =>
        sub.dietaryTags?.includes("vegetarian"),
      ),
    ).toBe(true);
  });
});

describe("filterSubstitutionsByDiet", () => {
  const sampleSubs: Substitution[] = [
    {
      substitute: "Dairy swap",
      ratioOrNotes: "Use 1:1.",
      dietaryTags: ["vegetarian"],
    },
    {
      substitute: "Plant swap",
      ratioOrNotes: "Use 1:1.",
      dietaryTags: ["vegan", "dairy-free"],
    },
    {
      substitute: "Pantry swap",
      ratioOrNotes: "Use as needed.",
    },
  ];

  it("returns all substitutions when no tags are required", () => {
    expect(filterSubstitutionsByDiet(sampleSubs, [])).toEqual(sampleSubs);
  });

  it("keeps only substitutions with all required tags", () => {
    expect(
      filterSubstitutionsByDiet(sampleSubs, ["vegan", "dairy-free"]),
    ).toEqual([sampleSubs[1]]);
  });
});

describe("orderSubstitutionsByDiet", () => {
  it("stably moves substitutions matching all preferred tags first", () => {
    const sampleSubs: Substitution[] = [
      {
        substitute: "First non-match",
        ratioOrNotes: "Use 1:1.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "First match",
        ratioOrNotes: "Use 1:1.",
        dietaryTags: ["vegan", "dairy-free"],
      },
      {
        substitute: "Second non-match",
        ratioOrNotes: "Use 1:1.",
        dietaryTags: ["vegan"],
      },
      {
        substitute: "Second match",
        ratioOrNotes: "Use 1:1.",
        dietaryTags: ["vegan", "dairy-free", "gluten-free"],
      },
    ];

    expect(
      orderSubstitutionsByDiet(sampleSubs, ["vegan", "dairy-free"]).map(
        (sub) => sub.substitute,
      ),
    ).toEqual([
      "First match",
      "Second match",
      "First non-match",
      "Second non-match",
    ]);
  });

  it("leaves order unchanged without preferred tags", () => {
    const flourSwaps = getSubstitutions("all-purpose flour");

    expect(orderSubstitutionsByDiet(flourSwaps, [])).toEqual(flourSwaps);
  });
});

describe("SUBSTITUTIONS data integrity", () => {
  const allowedTags: DietaryTag[] = [
    "vegan",
    "vegetarian",
    "dairy-free",
    "gluten-free",
    "egg-free",
  ];

  it("covers a broad set of staples", () => {
    expect(SUBSTITUTIONS.length).toBeGreaterThanOrEqual(30);
  });

  it("has unique display names", () => {
    const names = SUBSTITUTIONS.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps every entry well-formed", () => {
    for (const entry of SUBSTITUTIONS) {
      expect(entry.name.trim()).not.toBe("");
      expect(entry.aliases.length).toBeGreaterThan(0);
      expect(entry.substitutions.length).toBeGreaterThan(0);

      for (const alias of entry.aliases) {
        // Aliases must already be in normalized form so the index matches them.
        expect(alias).toBe(normalizeIngredient(alias));
      }

      for (const sub of entry.substitutions) {
        expect(sub.substitute.trim()).not.toBe("");
        expect(sub.ratioOrNotes.trim()).not.toBe("");
        for (const tag of sub.dietaryTags ?? []) {
          expect(allowedTags).toContain(tag);
        }
      }
    }
  });

  it("every alias resolves back to its own entry", () => {
    for (const entry of SUBSTITUTIONS) {
      for (const alias of entry.aliases) {
        expect(matchIngredient(alias)?.name).toBe(entry.name);
      }
    }
  });
});

describe("scalingNudge", () => {
  it("nudges on an awkward fractional egg count with a volume tip", () => {
    const note = scalingNudge(1.5, null, "large eggs");
    expect(note).toBeTruthy();
    expect(note).toContain("tbsp");
    expect(note).toContain("4½"); // 1.5 eggs * 3 tbsp
  });

  it("nudges on other countable items with round guidance", () => {
    expect(scalingNudge(2.5, null, "onions")).toContain("round to 2 or 3");
    expect(scalingNudge(0.5, null, "lemon")).toContain("round up to 1");
  });

  it("stays quiet for whole counts", () => {
    expect(scalingNudge(2, null, "eggs")).toBeNull();
    expect(scalingNudge(3, "", "onions")).toBeNull();
  });

  it("stays quiet for measured units (fractions are fine there)", () => {
    expect(scalingNudge(1.5, "cup", "flour")).toBeNull();
    expect(scalingNudge(0.5, "tsp", "salt")).toBeNull();
  });

  it("stays quiet for missing or zero quantities", () => {
    expect(scalingNudge(null, null, "eggs")).toBeNull();
    expect(scalingNudge(undefined, null, "eggs")).toBeNull();
    expect(scalingNudge(0, null, "eggs")).toBeNull();
  });

  it("treats near-whole amounts as clean", () => {
    expect(scalingNudge(2.03, null, "eggs")).toBeNull();
    expect(scalingNudge(1.97, null, "eggs")).toBeNull();
  });
});
