import { describe, expect, it } from 'vitest';

import {
  computeBakersFormula,
  computeBatchYield,
  isFlour,
  isLiquid,
  perPieceWeight,
  type WeighedIngredient,
} from './bakers-math';

// A simple sourdough-ish formula in weights so densities aren't in play.
const dough: WeighedIngredient[] = [
  { item: 'bread flour', quantity: 500, unit: 'g' },
  { item: 'water', quantity: 350, unit: 'g' },
  { item: 'salt', quantity: 10, unit: 'g' },
  { item: 'levain', quantity: 100, unit: 'g' },
  { item: 'eggs', quantity: 2, unit: null }, // countable, no weight
];

describe('classification', () => {
  it('recognises flours and liquids', () => {
    expect(isFlour('bread flour')).toBe(true);
    expect(isFlour('whole wheat flour')).toBe(true);
    expect(isFlour('semolina')).toBe(true);
    expect(isFlour('sugar')).toBe(false);
    expect(isLiquid('water')).toBe(true);
    expect(isLiquid('whole milk')).toBe(true);
    expect(isLiquid('bread flour')).toBe(false);
  });
});

describe('computeBakersFormula (#384)', () => {
  it('computes percentages against total flour and hydration', () => {
    const f = computeBakersFormula(dough)!;
    expect(f.totalFlour).toBe(500);
    const flourLine = f.lines.find((l) => l.item === 'bread flour')!;
    expect(flourLine.percent).toBe(100);
    const waterLine = f.lines.find((l) => l.item === 'water')!;
    expect(waterLine.percent).toBe(70);
    const saltLine = f.lines.find((l) => l.item === 'salt')!;
    expect(saltLine.percent).toBe(2);
    expect(f.hydration).toBe(70);
    // The count-only egg row is dropped (no derivable weight).
    expect(f.lines.some((l) => l.item === 'eggs')).toBe(false);
  });

  it('sums multiple flours into the 100% base', () => {
    const f = computeBakersFormula([
      { item: 'bread flour', quantity: 400, unit: 'g' },
      { item: 'whole wheat flour', quantity: 100, unit: 'g' },
      { item: 'water', quantity: 375, unit: 'g' },
    ])!;
    expect(f.totalFlour).toBe(500);
    expect(f.hydration).toBe(75);
  });

  it('scales with the factor without changing percentages', () => {
    const single = computeBakersFormula(dough)!;
    const doubled = computeBakersFormula(dough, 2)!;
    expect(doubled.totalFlour).toBe(1000);
    expect(doubled.lines.find((l) => l.item === 'water')!.percent).toBe(
      single.lines.find((l) => l.item === 'water')!.percent,
    );
  });

  it('returns null for non-bakeable recipes', () => {
    expect(
      computeBakersFormula([
        { item: 'chicken breast', quantity: 2, unit: null },
        { item: 'olive oil', quantity: 1, unit: 'tbsp' },
      ]),
    ).toBeNull();
  });
});

describe('computeBatchYield + perPieceWeight (#418)', () => {
  it('totals derivable weight and derives per-piece grams', () => {
    const y = computeBatchYield(dough, 1, 12)!;
    expect(y.totalWeight).toBe(960); // 500 + 350 + 10 + 100
    expect(y.perUnit).toBeCloseTo(80, 5);
    expect(y.omittedItems).toEqual(['eggs']);
  });

  it('reports the exact omitted lines without changing the known-weight subtotal (#1187)', () => {
    const mixed: WeighedIngredient[] = [
      { item: 'spaghetti', quantity: 400, unit: 'g' },
      { item: 'guanciale', quantity: 156, unit: 'g' },
      { item: 'pecorino', quantity: 100, unit: 'g' },
      { item: 'large eggs', quantity: 4, unit: null },
      { item: 'egg yolks', quantity: 2, unit: null },
      { item: 'unresolved seasoning', quantity: 1, unit: 'tsp' },
    ];
    expect(computeBatchYield(mixed, 1, 8)).toEqual({
      totalWeight: 656,
      perUnit: 82,
      omittedItems: ['large eggs', 'egg yolks', 'unresolved seasoning'],
    });
    expect(computeBatchYield(mixed, 2, 8)).toEqual({
      totalWeight: 1312,
      perUnit: 164,
      omittedItems: ['large eggs', 'egg yolks', 'unresolved seasoning'],
    });
    expect(computeBatchYield(mixed, 1, 4)?.perUnit).toBe(164);
  });

  it('keeps an explicit all-mass batch complete at 960 g and 80 g per piece (#1187)', () => {
    expect(
      computeBatchYield(
        [
          { item: 'bread flour', quantity: 500, unit: 'g' },
          { item: 'water', quantity: 350, unit: 'g' },
          { item: 'salt', quantity: 10, unit: 'g' },
          { item: 'levain', quantity: 100, unit: 'g' },
        ],
        1,
        12,
      ),
    ).toEqual({ totalWeight: 960, perUnit: 80, omittedItems: [] });
  });

  it('records nonpositive and missing amounts in calculation coverage (#1187)', () => {
    expect(
      computeBatchYield([
        { item: 'flour', quantity: 100, unit: 'g' },
        { item: 'zero salt', quantity: 0, unit: 'g' },
        { item: 'negative sugar', quantity: -1, unit: 'g' },
        { item: 'water to taste', quantity: null, unit: 'g' },
      ]),
    ).toEqual({
      totalWeight: 100,
      perUnit: null,
      omittedItems: ['zero salt', 'negative sugar', 'water to taste'],
    });
  });

  it('scales the total with the factor', () => {
    const y = computeBatchYield(dough, 2)!;
    expect(y.totalWeight).toBe(1920);
    expect(y.perUnit).toBeNull();
  });

  it('returns null when nothing is weighable', () => {
    expect(computeBatchYield([{ item: 'eggs', quantity: 3, unit: null }])).toBeNull();
  });

  it('perPieceWeight guards bad divisors', () => {
    expect(perPieceWeight(900, 12)).toBe(75);
    expect(perPieceWeight(900, 0)).toBeNull();
    expect(perPieceWeight(900, -3)).toBeNull();
    expect(perPieceWeight(0, 12)).toBeNull();
    expect(perPieceWeight(null, 12)).toBeNull();
  });
});
