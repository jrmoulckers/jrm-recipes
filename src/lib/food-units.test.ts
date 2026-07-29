import { describe, expect, it } from "vitest";

import { FOOD_CATEGORIES } from "./food-db";
import {
  CATEGORY_UNIT_SUGGESTIONS,
  getSuggestedUnitsForFood,
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
