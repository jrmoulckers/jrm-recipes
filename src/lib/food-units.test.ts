import { describe, expect, it } from "vitest";

import { FOOD_CATEGORIES } from "./food-db";
import {
  CATEGORY_UNIT_SUGGESTIONS,
  dimensionForUnit,
  getSuggestedUnitsForFood,
  mergeLearnedUnits,
  suggestedUnitsForCategory,
  type SuggestedUnit,
} from "./food-units";

const dims = (units: SuggestedUnit[]) => units.map((u) => u.dimension);
const tokens = (units: SuggestedUnit[]) => units.map((u) => u.unit);

describe("suggestedUnitsForCategory", () => {
  it("returns a non-empty ordered list for every category", () => {
    for (const category of FOOD_CATEGORIES) {
      expect(suggestedUnitsForCategory(category).length).toBeGreaterThan(0);
    }
  });

  it("returns a fresh copy callers can mutate safely", () => {
    const a = suggestedUnitsForCategory("liquid");
    a.pop();
    expect(suggestedUnitsForCategory("liquid").length).toBe(
      CATEGORY_UNIT_SUGGESTIONS.liquid.length,
    );
  });

  it("leads with volume for liquids and mass for baking staples", () => {
    expect(dims(suggestedUnitsForCategory("liquid"))[0]).toBe("volume");
    expect(dims(suggestedUnitsForCategory("baking"))[0]).toBe("mass");
    expect(dims(suggestedUnitsForCategory("meat"))[0]).toBe("mass");
  });

  it("leads with count for whole produce and eggs", () => {
    expect(dims(suggestedUnitsForCategory("produce-whole"))[0]).toBe("count");
    expect(tokens(suggestedUnitsForCategory("produce-whole"))[0]).toBe("each");
    expect(dims(suggestedUnitsForCategory("egg"))[0]).toBe("count");
  });

  it("offers small volumes and a pinch for spices", () => {
    const spice = suggestedUnitsForCategory("spice");
    expect(tokens(spice)).toContain("tsp");
    expect(tokens(spice)).toContain("pinch");
  });
});

describe("getSuggestedUnitsForFood", () => {
  it("suggests volume-first units for a liquid ingredient", () => {
    const units = getSuggestedUnitsForFood("2 cups water");
    expect(units[0]).toEqual({ dimension: "volume", unit: "cup" });
  });

  it("suggests count-first units for a whole vegetable", () => {
    const units = getSuggestedUnitsForFood("1 large onion, diced");
    expect(units[0]).toEqual({ dimension: "count", unit: "each" });
  });

  it("suggests small-volume + pinch for a spice", () => {
    const units = getSuggestedUnitsForFood("a pinch of ground cinnamon");
    expect(tokens(units)).toContain("pinch");
    expect(dims(units)[0]).toBe("volume");
  });

  it("suggests mass-first units for meat", () => {
    const units = getSuggestedUnitsForFood("1 lb chicken breast");
    expect(dims(units)[0]).toBe("mass");
    expect(tokens(units)[0]).toBe("lb");
  });

  it("returns an empty list for an unknown ingredient", () => {
    expect(getSuggestedUnitsForFood("xyzzy widget")).toEqual([]);
    expect(getSuggestedUnitsForFood(null)).toEqual([]);
    expect(getSuggestedUnitsForFood("")).toEqual([]);
  });

  it("matches the underlying category mapping", () => {
    expect(getSuggestedUnitsForFood("fresh basil")).toEqual(
      suggestedUnitsForCategory("herb"),
    );
  });
});

describe("suggestion shape", () => {
  it("only uses the four known dimensions", () => {
    const known = new Set(["volume", "mass", "count", "temperature"]);
    for (const category of FOOD_CATEGORIES) {
      for (const s of suggestedUnitsForCategory(category)) {
        expect(known.has(s.dimension)).toBe(true);
        expect(typeof s.unit).toBe("string");
        expect(s.unit.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("dimensionForUnit", () => {
  it("classifies canonical volume/mass tokens", () => {
    expect(dimensionForUnit("cup")).toBe("volume");
    expect(dimensionForUnit("fl oz")).toBe("volume");
    expect(dimensionForUnit("g")).toBe("mass");
    expect(dimensionForUnit("LB")).toBe("mass");
  });

  it("treats count/portion tokens and unknowns as count (never dropped)", () => {
    expect(dimensionForUnit("each")).toBe("count");
    expect(dimensionForUnit("pinch")).toBe("count");
    expect(dimensionForUnit("glug")).toBe("count");
  });
});

describe("mergeLearnedUnits", () => {
  const fallback: SuggestedUnit[] = [
    { dimension: "count", unit: "each" },
    { dimension: "mass", unit: "g" },
  ];

  it("leads with learned units by usage, then appends missing fallbacks", () => {
    const merged = mergeLearnedUnits(
      [
        { unit: "cup", useCount: 3 },
        { unit: "g", useCount: 9 },
      ],
      fallback,
    );
    // g (9) before cup (3), then the fallback `each` not already present.
    expect(tokens(merged)).toEqual(["g", "cup", "each"]);
    expect(merged[0]).toEqual({ dimension: "mass", unit: "g" });
  });

  it("returns a copy of the fallback when there is no learned data", () => {
    expect(mergeLearnedUnits([], fallback)).toEqual(fallback);
  });

  it("de-duplicates by unit token", () => {
    const merged = mergeLearnedUnits([{ unit: "each", useCount: 2 }], fallback);
    expect(tokens(merged).filter((u) => u === "each")).toHaveLength(1);
  });
});
