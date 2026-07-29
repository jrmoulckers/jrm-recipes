import { describe, expect, it } from "vitest";

import { foodNodeId } from "./food-db";
import {
  mineFoodGraph,
  rankNeighbours,
  rankUnitStats,
  type MinedIngredient,
  type PairEdge,
} from "./food-mining";

const onion = foodNodeId("Onion");
const tomato = foodNodeId("Tomato");
const garlic = foodNodeId("Garlic");
const basil = foodNodeId("Basil");

const CORPUS: MinedIngredient[] = [
  { recipeId: "r1", item: "onion", unit: "", quantity: 1 },
  { recipeId: "r1", item: "tomatoes", unit: "cup", quantity: 2 },
  { recipeId: "r1", item: "garlic", unit: "clove", quantity: 3, prep: "minced" },
  { recipeId: "r2", item: "yellow onion", unit: "each", quantity: 2, prep: "Diced" },
  { recipeId: "r2", item: "tomato", unit: "g", quantity: 200 },
  { recipeId: "r3", item: "onion", unit: "each", quantity: 1 },
  { recipeId: "r3", item: "fresh basil", unit: "tbsp", quantity: 1 },
  { recipeId: "r3", item: "unicorn horn", unit: "each", quantity: 1 }, // unmatched
];

describe("mineFoodGraph", () => {
  const mined = mineFoodGraph(CORPUS);

  it("counts distinct recipes per node and skips unmatched items", () => {
    const byId = new Map(mined.nodes.map((n) => [n.id, n]));
    expect(byId.get(onion)?.recipeCount).toBe(3);
    expect(byId.get(tomato)?.recipeCount).toBe(2);
    expect(byId.get(garlic)?.recipeCount).toBe(1);
    // "unicorn horn" resolves to nothing, so it never becomes a node.
    expect(mined.nodes.every((n) => n.name !== "unicorn horn")).toBe(true);
  });

  it("aggregates unit usage and a quantity distribution", () => {
    const onionEach = mined.unitStats.find(
      (u) => u.foodId === onion && u.unit === "each",
    );
    // r1 empty unit → `each` (qty 1), r2 `each` (qty 2), r3 `each` (qty 1).
    expect(onionEach?.useCount).toBe(3);
    expect(onionEach?.p50).toBeCloseTo(1, 5); // samples [1, 1, 2] → median 1

    const tomatoCup = mined.unitStats.find(
      (u) => u.foodId === tomato && u.unit === "cup",
    );
    expect(tomatoCup?.useCount).toBe(1);
    expect(tomatoCup?.p50).toBe(2);
  });

  it("records normalized prep affinity", () => {
    const diced = mined.prepStats.find(
      (p) => p.foodId === onion && p.prep === "diced",
    );
    expect(diced?.useCount).toBe(1);
    const minced = mined.prepStats.find(
      (p) => p.foodId === garlic && p.prep === "minced",
    );
    expect(minced?.useCount).toBe(1);
  });

  it("records aliases keyed to the canonical node", () => {
    const aliases = mined.aliases.filter((a) => a.foodId === onion);
    const onionAlias = aliases.find((a) => a.alias === "onion");
    expect(onionAlias?.useCount).toBe(2); // r1 + r3
    expect(aliases.some((a) => a.alias === "yellow onion")).toBe(true);
  });

  it("emits co-occurrence pairs above the support threshold with lift", () => {
    // Default minPairCoCount = 2 → only the onion/tomato pair (2 recipes).
    expect(mined.pairs).toHaveLength(1);
    const pair = mined.pairs[0]!;
    expect([pair.foodAId, pair.foodBId].sort()).toEqual([onion, tomato].sort());
    expect(pair.coCount).toBe(2);
    // lift = coCount·N / (countA·countB) = 2·3 / (3·2) = 1.
    expect(pair.lift).toBeCloseTo(1, 5);
    // Stored canonically with foodAId < foodBId.
    expect(pair.foodAId < pair.foodBId).toBe(true);
  });

  it("surfaces thinner pairs when the threshold is lowered", () => {
    const loose = mineFoodGraph(CORPUS, { minPairCoCount: 1 });
    const hasBasilEdge = loose.pairs.some(
      (p) =>
        (p.foodAId === onion && p.foodBId === basil) ||
        (p.foodAId === basil && p.foodBId === onion),
    );
    expect(hasBasilEdge).toBe(true);
  });
});

describe("rankNeighbours", () => {
  const edges: PairEdge[] = [
    { foodAId: onion, foodBId: tomato, coCount: 5, lift: 2.0 },
    { foodAId: garlic, foodBId: onion, coCount: 3, lift: 1.5 },
    { foodAId: onion, foodBId: basil, coCount: 1, lift: 0.4 },
  ];

  it("returns partners of the query node ordered by lift", () => {
    const ranked = rankNeighbours(edges, [onion]);
    expect(ranked.map((r) => r.foodId)).toEqual([tomato, garlic, basil]);
  });

  it("honors the coCount floor and the query/exclude sets", () => {
    const ranked = rankNeighbours(edges, [onion], {
      minCoCount: 2,
      exclude: [garlic],
    });
    expect(ranked.map((r) => r.foodId)).toEqual([tomato]);
  });

  it("never suggests a query food back to itself", () => {
    const ranked = rankNeighbours(edges, [onion, tomato]);
    expect(ranked.some((r) => r.foodId === onion || r.foodId === tomato)).toBe(
      false,
    );
  });
});

describe("rankUnitStats", () => {
  it("orders by usage and applies the minimum-use floor", () => {
    const ranked = rankUnitStats(
      [
        { unit: "g", useCount: 1, p10: null, p50: null, p90: null },
        { unit: "cup", useCount: 9, p10: null, p50: null, p90: null },
        { unit: "tbsp", useCount: 4, p10: null, p50: null, p90: null },
      ],
      { minUseCount: 2 },
    );
    expect(ranked.map((r) => r.unit)).toEqual(["cup", "tbsp"]);
  });
});
