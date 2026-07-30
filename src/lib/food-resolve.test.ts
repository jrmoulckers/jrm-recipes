import { describe, expect, it } from "vitest";

import { buildAliasIndex, pickFoodId } from "./food-resolve";
import { canonicalFood, foodNodeId } from "./food-db";

describe("buildAliasIndex", () => {
  it("normalizes alias keys defensively", () => {
    const index = buildAliasIndex([
      { alias: "Yellow Onion", foodId: "food_yellow", useCount: 3 },
    ]);
    expect(index.get("yellow onion")).toBe("food_yellow");
    expect(index.get("Yellow Onion")).toBeUndefined();
  });

  it("keeps the more-used node when an alias maps to several", () => {
    const index = buildAliasIndex([
      { alias: "sauce", foodId: "food_a", useCount: 1 },
      { alias: "sauce", foodId: "food_b", useCount: 5 },
    ]);
    expect(index.get("sauce")).toBe("food_b");
  });

  it("breaks ties on equal useCount lexicographically for determinism", () => {
    const forward = buildAliasIndex([
      { alias: "sauce", foodId: "food_b", useCount: 2 },
      { alias: "sauce", foodId: "food_a", useCount: 2 },
    ]);
    const reversed = buildAliasIndex([
      { alias: "sauce", foodId: "food_a", useCount: 2 },
      { alias: "sauce", foodId: "food_b", useCount: 2 },
    ]);
    expect(forward.get("sauce")).toBe("food_a");
    expect(reversed.get("sauce")).toBe("food_a");
  });

  it("skips rows whose alias normalizes to empty", () => {
    const index = buildAliasIndex([
      { alias: "   ", foodId: "food_x", useCount: 1 },
    ]);
    expect(index.size).toBe(0);
  });
});

describe("pickFoodId", () => {
  it("resolves an exact alias match (incl. quantity-bearing mined phrasings)", () => {
    // Mined aliases are the full normalized item string, so a repeat phrasing
    // hits directly — even one the curated matcher wouldn't score the same way.
    const index = buildAliasIndex([
      { alias: "2 tbsp kosher salt", foodId: "food_salt", useCount: 4 },
    ]);
    expect(pickFoodId("2 Tbsp Kosher Salt", index)).toBe("food_salt");
    // Post-comma prep notes are stripped before matching.
    expect(pickFoodId("2 tbsp kosher salt, for finishing", index)).toBe(
      "food_salt",
    );
  });

  it("routes a variety alias to its own node, ahead of the curated fallback", () => {
    // A variety child node ("yellow onion") the curated matcher would fold into
    // the canonical Onion parent still resolves to the variety when an alias
    // points there.
    const varietyId = "food_onion_yellow";
    const index = buildAliasIndex([
      { alias: "yellow onion", foodId: varietyId, useCount: 2 },
    ]);
    expect(pickFoodId("yellow onion", index)).toBe(varietyId);
    expect(pickFoodId("yellow onion", index)).not.toBe(foodNodeId("Onion"));
  });

  it("falls back to the curated static dataset (whole-word containment)", () => {
    const empty = buildAliasIndex([]);
    expect(pickFoodId("2 cloves garlic, minced", empty)).toBe(
      canonicalFood("garlic")?.id,
    );
    expect(pickFoodId("2 cloves garlic, minced", empty)).toBe(
      foodNodeId("Garlic"),
    );
  });

  it("returns null when nothing resolves", () => {
    const empty = buildAliasIndex([]);
    expect(pickFoodId("qwerty zxcvb nonsense", empty)).toBeNull();
    expect(pickFoodId("", empty)).toBeNull();
    expect(pickFoodId(null, empty)).toBeNull();
    expect(pickFoodId(undefined, empty)).toBeNull();
  });
});
