import { describe, expect, it } from "vitest";

import { FOOD_ITEMS } from "~/lib/food-db";
import { buildFoodItemRows, foodSlug } from "./seed-ingredients";

describe("foodSlug", () => {
  it("produces a stable, hyphenated, normalized key", () => {
    expect(foodSlug("Brown sugar")).toBe("brown-sugar");
    expect(foodSlug("Tomato (canned)")).toBe("tomato");
    expect(foodSlug("Fat / oil")).toBe("fat-oil");
  });
});

describe("buildFoodItemRows", () => {
  const rows = buildFoodItemRows();

  it("emits one row per curated food", () => {
    expect(rows).toHaveLength(FOOD_ITEMS.length);
  });

  it("gives every row a stable, unique, prefixed id and slug", () => {
    const ids = new Set(rows.map((r) => r.id));
    const slugs = new Set(rows.map((r) => r.slug));
    expect(ids.size).toBe(rows.length);
    expect(slugs.size).toBe(rows.length);
    for (const row of rows) {
      expect(row.id).toBe(`seed_food_${row.slug}`);
      expect(row.slug.length).toBeLessThanOrEqual(80);
    }
  });

  it("carries category and density (null when unknown)", () => {
    const water = rows.find((r) => r.slug === "water");
    expect(water?.category).toBe("liquid");
    expect(water?.densityGPerMl).toBe(1.0);

    const egg = rows.find((r) => r.slug === "egg");
    expect(egg?.category).toBe("egg");
    expect(egg?.densityGPerMl).toBeNull();
  });
});
