import { describe, expect, it } from 'vitest';

import { foodNodeId } from './food-db';
import {
  mineFoodGraph,
  rankNeighbours,
  rankUnitStats,
  type MinedIngredient,
  type PairEdge,
} from './food-mining';

const onion = foodNodeId('Onion');
const tomato = foodNodeId('Tomato');
const garlic = foodNodeId('Garlic');
const basil = foodNodeId('Basil');

const CORPUS: MinedIngredient[] = [
  { recipeId: 'r1', item: 'onion', unit: '', quantity: 1 },
  { recipeId: 'r1', item: 'tomatoes', unit: 'cup', quantity: 2 },
  {
    recipeId: 'r1',
    item: 'garlic',
    unit: 'clove',
    quantity: 3,
    prep: 'minced',
  },
  {
    recipeId: 'r2',
    item: 'yellow onion',
    unit: 'each',
    quantity: 2,
    prep: 'Diced',
  },
  { recipeId: 'r2', item: 'tomato', unit: 'g', quantity: 200 },
  { recipeId: 'r3', item: 'onion', unit: 'each', quantity: 1 },
  { recipeId: 'r3', item: 'fresh basil', unit: 'tbsp', quantity: 1 },
  { recipeId: 'r3', item: 'unicorn horn', unit: 'each', quantity: 1 }, // unmatched
];

describe('mineFoodGraph', () => {
  const mined = mineFoodGraph(CORPUS);

  it('counts distinct recipes per node and skips unmatched items', () => {
    const byId = new Map(mined.nodes.map((n) => [n.id, n]));
    expect(byId.get(onion)?.recipeCount).toBe(3);
    expect(byId.get(tomato)?.recipeCount).toBe(2);
    expect(byId.get(garlic)?.recipeCount).toBe(1);
    // "unicorn horn" resolves to nothing, so it never becomes a node.
    expect(mined.nodes.every((n) => n.name !== 'unicorn horn')).toBe(true);
  });

  it('aggregates unit usage and a quantity distribution', () => {
    const onionEach = mined.unitStats.find((u) => u.foodId === onion && u.unit === 'each');
    // r1 empty unit → `each` (qty 1), r2 `each` (qty 2), r3 `each` (qty 1).
    expect(onionEach?.useCount).toBe(3);
    expect(onionEach?.p50).toBeCloseTo(1, 5); // samples [1, 1, 2] → median 1

    const tomatoCup = mined.unitStats.find((u) => u.foodId === tomato && u.unit === 'cup');
    expect(tomatoCup?.useCount).toBe(1);
    expect(tomatoCup?.p50).toBe(2);
  });

  it('records normalized prep affinity', () => {
    const diced = mined.prepStats.find((p) => p.foodId === onion && p.prep === 'diced');
    expect(diced?.useCount).toBe(1);
    const minced = mined.prepStats.find((p) => p.foodId === garlic && p.prep === 'minced');
    expect(minced?.useCount).toBe(1);
  });

  it('records aliases keyed to the canonical node', () => {
    const aliases = mined.aliases.filter((a) => a.foodId === onion);
    const onionAlias = aliases.find((a) => a.alias === 'onion');
    expect(onionAlias?.useCount).toBe(2); // r1 + r3
    expect(aliases.some((a) => a.alias === 'yellow onion')).toBe(true);
  });

  it('emits co-occurrence pairs above the support threshold with lift', () => {
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

  it('surfaces thinner pairs when the threshold is lowered', () => {
    const loose = mineFoodGraph(CORPUS, { minPairCoCount: 1 });
    const hasBasilEdge = loose.pairs.some(
      (p) =>
        (p.foodAId === onion && p.foodBId === basil) ||
        (p.foodAId === basil && p.foodBId === onion),
    );
    expect(hasBasilEdge).toBe(true);
  });
});

describe('rankNeighbours', () => {
  const edges: PairEdge[] = [
    { foodAId: onion, foodBId: tomato, coCount: 5, lift: 2.0 },
    { foodAId: garlic, foodBId: onion, coCount: 3, lift: 1.5 },
    { foodAId: onion, foodBId: basil, coCount: 1, lift: 0.4 },
  ];

  it('returns partners of the query node ordered by lift', () => {
    const ranked = rankNeighbours(edges, [onion]);
    expect(ranked.map((r) => r.foodId)).toEqual([tomato, garlic, basil]);
  });

  it('honors the coCount floor and the query/exclude sets', () => {
    const ranked = rankNeighbours(edges, [onion], {
      minCoCount: 2,
      exclude: [garlic],
    });
    expect(ranked.map((r) => r.foodId)).toEqual([tomato]);
  });

  it('never suggests a query food back to itself', () => {
    const ranked = rankNeighbours(edges, [onion, tomato]);
    expect(ranked.some((r) => r.foodId === onion || r.foodId === tomato)).toBe(false);
  });
});

describe('rankUnitStats', () => {
  it('orders by usage and applies the minimum-use floor', () => {
    const ranked = rankUnitStats(
      [
        { unit: 'g', useCount: 1, p10: null, p50: null, p90: null },
        { unit: 'cup', useCount: 9, p10: null, p50: null, p90: null },
        { unit: 'tbsp', useCount: 4, p10: null, p50: null, p90: null },
      ],
      { minUseCount: 2 },
    );
    expect(ranked.map((r) => r.unit)).toEqual(['cup', 'tbsp']);
  });
});

describe('mineFoodGraph. Personalization + reverse index', () => {
  // u1 authored r1 + r3, u2 authored r2 (see recipe ids in CORPUS).
  const AUTHORED: MinedIngredient[] = [
    {
      recipeId: 'r1',
      item: 'onion',
      unit: 'each',
      quantity: 1,
      authorId: 'u1',
    },
    { recipeId: 'r1', item: 'onion', unit: 'cup', quantity: 1, authorId: 'u1' },
    {
      recipeId: 'r3',
      item: 'onion',
      unit: 'each',
      quantity: 1,
      prep: 'sliced',
      authorId: 'u1',
    },
    {
      recipeId: 'r2',
      item: 'yellow onion',
      unit: 'g',
      quantity: 200,
      prep: 'diced',
      authorId: 'u2',
    },
    {
      recipeId: 'r2',
      item: 'tomato',
      unit: 'g',
      quantity: 100,
      authorId: 'u2',
    },
    { recipeId: 'r4', item: 'onion', unit: 'each', quantity: 1 }, // no author
  ];
  const mined = mineFoodGraph(AUTHORED);

  it("derives each user's most-used unit and prep per food", () => {
    const u1Onion = mined.userPrefs.find((p) => p.userId === 'u1' && p.foodId === onion);
    // u1 used onion 3 times (each, each, cup) → preferredUnit "each". Prep only
    // recorded once ("sliced").
    expect(u1Onion?.useCount).toBe(3);
    expect(u1Onion?.preferredUnit).toBe('each');
    expect(u1Onion?.preferredPrep).toBe('sliced');
    expect(u1Onion?.preferredVariantId).toBeNull();

    const u2Onion = mined.userPrefs.find((p) => p.userId === 'u2' && p.foodId === onion);
    expect(u2Onion?.preferredUnit).toBe('g');
    expect(u2Onion?.preferredPrep).toBe('diced');
  });

  it('does not emit prefs for author-less lines', () => {
    expect(mined.userPrefs.some((p) => p.userId === '' || p.userId == null)).toBe(false);
  });

  it('builds a food → recipe reverse index with per-recipe line counts', () => {
    const onionLinks = mined.recipeLinks.filter((l) => l.foodId === onion);
    const recipesWithOnion = onionLinks.map((l) => l.recipeId).sort();
    // "yellow onion" in r2 canonicalizes to Onion too, so onion spans r1–r4.
    expect(recipesWithOnion).toEqual(['r1', 'r2', 'r3', 'r4']);
    // onion appears twice in r1 → useCount 2 there, once elsewhere.
    expect(onionLinks.find((l) => l.recipeId === 'r1')?.useCount).toBe(2);
    expect(onionLinks.find((l) => l.recipeId === 'r3')?.useCount).toBe(1);
  });
});
