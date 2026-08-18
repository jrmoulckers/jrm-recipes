import { describe, expect, it } from 'vitest';

import {
  NUTRIENT_IDS,
  NUTRIENT_REGISTRY,
  accumulateVector,
  hasNutrients,
  macros,
  nutrientById,
  scaleVector,
  toNutritionKeys,
  vectorFromRows,
} from './nutrients';

describe('NUTRIENT_REGISTRY', () => {
  it('declares each id, per-serving key and display slot exactly once', () => {
    const ids = NUTRIENT_REGISTRY.map((n) => n.id);
    const keys = NUTRIENT_REGISTRY.map((n) => n.nutritionKey);
    const orders = NUTRIENT_REGISTRY.map((n) => n.displayOrder);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('is stored in display order so consumers can project it verbatim', () => {
    const orders = NUTRIENT_REGISTRY.map((n) => n.displayOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(NUTRIENT_IDS).toEqual(NUTRIENT_REGISTRY.map((n) => n.id));
  });

  it('keeps every declaration well-formed', () => {
    for (const n of NUTRIENT_REGISTRY) {
      expect(n.label.length).toBeGreaterThan(0);
      expect(['kcal', 'g', 'mg']).toContain(n.unit);
      expect(Number.isInteger(n.displayPrecision)).toBe(true);
      expect(n.displayPrecision).toBeGreaterThanOrEqual(0);
      if (n.dailyValue !== null) expect(n.dailyValue).toBeGreaterThan(0);
    }
  });

  it('marks exactly the four headline macros', () => {
    expect(
      NUTRIENT_REGISTRY.filter((n) => n.isMacro)
        .map((n) => n.id)
        .sort(),
    ).toEqual(['carbsG', 'fatG', 'kcal', 'proteinG']);
  });

  it('carries saturated fat, the nutrient #1028 unstrands', () => {
    const satFat = nutrientById('satFatG');
    expect(satFat?.nutritionKey).toBe('saturatedFatGrams');
  });

  it('returns undefined for an unknown id', () => {
    expect(nutrientById('dilithiumMg')).toBeUndefined();
  });
});

describe('macros', () => {
  it('projects the four headline numbers as plain numbers', () => {
    expect(macros({ kcal: 100, proteinG: 5, fatG: 2, carbsG: 9, sodiumMg: 30 })).toEqual({
      calories: 100,
      protein: 5,
      fat: 2,
      carbs: 9,
    });
  });

  it('defaults an absent macro to zero so call sites stay ergonomic', () => {
    expect(macros({})).toEqual({ calories: 0, protein: 0, fat: 0, carbs: 0 });
  });
});

describe('accumulateVector', () => {
  it('adds scaled amounts in place and returns the accumulator', () => {
    const acc = { kcal: 10 };
    const out = accumulateVector(acc, { kcal: 100, proteinG: 4 }, 0.5);
    expect(out).toBe(acc);
    expect(acc).toEqual({ kcal: 60, proteinG: 2 });
  });

  it('leaves a nutrient nothing sourced absent rather than a confident zero', () => {
    const acc = accumulateVector({}, { kcal: 100 }, 1);
    expect(acc.satFatG).toBeUndefined();
    expect('satFatG' in acc).toBe(false);
  });

  it('ignores non-finite amounts and a non-finite factor', () => {
    expect(accumulateVector({}, { kcal: Number.NaN, proteinG: 3 }, 2)).toEqual({ proteinG: 6 });
    expect(accumulateVector({ kcal: 1 }, { kcal: 100 }, Number.NaN)).toEqual({ kcal: 1 });
  });
});

describe('scaleVector', () => {
  it('scales present nutrients and keeps absent ones absent', () => {
    expect(scaleVector({ kcal: 200, sodiumMg: 50 }, 0.25)).toEqual({ kcal: 50, sodiumMg: 12.5 });
  });
});

describe('hasNutrients', () => {
  it('distinguishes an empty vector from one carrying a usable amount', () => {
    expect(hasNutrients({})).toBe(false);
    expect(hasNutrients({ kcal: Number.NaN })).toBe(false);
    expect(hasNutrients({ kcal: 0 })).toBe(true);
  });
});

describe('vectorFromRows', () => {
  it('builds a vector from stored rows', () => {
    expect(
      vectorFromRows([
        { nutrientId: 'kcal', per100g: 40 },
        { nutrientId: 'satFatG', per100g: 0.1 },
      ]),
    ).toEqual({ kcal: 40, satFatG: 0.1 });
  });

  it('skips unknown ids and null amounts instead of trusting the row', () => {
    expect(
      vectorFromRows([
        { nutrientId: 'cholesterolMg', per100g: 12 },
        { nutrientId: 'kcal', per100g: null },
        { nutrientId: 'proteinG', per100g: 3 },
      ]),
    ).toEqual({ proteinG: 3 });
  });
});

describe('toNutritionKeys', () => {
  it('renames the axis without touching the amounts', () => {
    expect(toNutritionKeys({ kcal: 165, proteinG: 31, satFatG: 1.9 })).toEqual({
      calories: 165,
      proteinGrams: 31,
      saturatedFatGrams: 1.9,
    });
  });

  it('drops absent and non-finite nutrients', () => {
    expect(toNutritionKeys({ kcal: Number.POSITIVE_INFINITY })).toEqual({});
  });
});
