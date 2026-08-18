import { describe, expect, it } from 'vitest';

import {
  compareToTargets,
  isIsoDate,
  percentOfTarget,
  sanitizeTargets,
  selectEffectiveTarget,
  TARGET_NUTRIENTS,
  targetRows,
  toIsoDate,
} from './nutrition-targets';

describe('sanitizeTargets', () => {
  it('keeps registry keys and drops unknown ones', () => {
    expect(sanitizeTargets({ calories: 2200, proteinGrams: 150, unicorns: 3 })).toEqual({
      calories: 2200,
      proteinGrams: 150,
    });
  });

  it('preserves an explicit zero, which is a real target', () => {
    expect(sanitizeTargets({ sugarGrams: 0 })).toEqual({ sugarGrams: 0 });
  });

  it('drops non-finite, negative and out-of-range values', () => {
    expect(
      sanitizeTargets({
        calories: Number.NaN,
        proteinGrams: -1,
        carbsGrams: 999999,
        fatGrams: 70,
      }),
    ).toEqual({ fatGrams: 70 });
  });

  it('is total on hostile input', () => {
    expect(sanitizeTargets(null)).toEqual({});
    expect(sanitizeTargets('2000')).toEqual({});
  });
});

describe('selectEffectiveTarget', () => {
  const rows = [
    { id: 'cut', effectiveFrom: '2026-01-01' },
    { id: 'bulk', effectiveFrom: '2026-06-01' },
    { id: 'maintenance', effectiveFrom: '2026-03-01' },
  ];

  it('picks the newest row on or before the date, whatever the input order', () => {
    expect(selectEffectiveTarget(rows, '2026-04-15')?.id).toBe('maintenance');
  });

  it('treats the effective date itself as in force', () => {
    expect(selectEffectiveTarget(rows, '2026-06-01')?.id).toBe('bulk');
  });

  it('returns null before the first target, rather than the earliest one', () => {
    expect(selectEffectiveTarget(rows, '2025-12-31')).toBeNull();
  });

  it('ignores a target that starts in the future', () => {
    expect(selectEffectiveTarget(rows, '2026-05-31')?.id).toBe('maintenance');
  });
});

describe('toIsoDate', () => {
  it('reads a Date in local time, so an evening does not roll into tomorrow', () => {
    // 23:30 local on the 5th is UTC the 6th in any negative-offset zone.
    expect(toIsoDate(new Date(2026, 2, 5, 23, 30))).toBe('2026-03-05');
  });

  it('narrows a timestamp string to its date', () => {
    expect(toIsoDate('2026-03-05T22:00:00.000Z')).toBe('2026-03-05');
  });
});

describe('isIsoDate', () => {
  it('accepts a real calendar date', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
  });

  it('rejects an impossible or malformed date', () => {
    expect(isIsoDate('2025-02-31')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('5 March')).toBe(false);
  });
});

describe('percentOfTarget', () => {
  it('rounds the ratio', () => {
    expect(percentOfTarget(500, 2000)).toBe(25);
  });

  it('counts zero intake as 0%', () => {
    expect(percentOfTarget(0, 2000)).toBe(0);
  });

  it('hides the indicator when either side is unusable', () => {
    expect(percentOfTarget(500, 0)).toBeNull();
    expect(percentOfTarget(null, 2000)).toBeNull();
    expect(percentOfTarget(500, null)).toBeNull();
    expect(percentOfTarget(-5, 2000)).toBeNull();
  });
});

describe('compareToTargets', () => {
  it('scores only nutrients that are both targeted and sourced', () => {
    const rows = compareToTargets(
      { calories: 600, proteinGrams: 30 },
      { calories: 2000, fatGrams: 70 },
    );
    expect(rows.map((r) => r.key)).toEqual(['calories']);
    expect(rows[0]).toMatchObject({ actual: 600, target: 2000, percent: 30, remaining: 1400 });
  });

  it('omits an unsourced nutrient rather than scoring it as zero', () => {
    // The recipe's protein could not be resolved. Reporting "0% of target" would
    // be a confident falsehood about food that was simply never weighed.
    expect(compareToTargets({ calories: 600 }, { proteinGrams: 150 })).toEqual([]);
  });

  it('returns rows in Nutrition Facts order', () => {
    const rows = compareToTargets(
      { calories: 500, proteinGrams: 40, fatGrams: 20 },
      { calories: 2000, proteinGrams: 150, fatGrams: 70 },
    );
    expect(rows.map((r) => r.key)).toEqual(['calories', 'fatGrams', 'proteinGrams']);
  });
});

describe('targetRows', () => {
  it('renders set targets in display order and skips the rest', () => {
    expect(targetRows({ proteinGrams: 150, calories: 2000 }).map((r) => r.key)).toEqual([
      'calories',
      'proteinGrams',
    ]);
  });
});

describe('TARGET_NUTRIENTS', () => {
  it('is projected from the registry, so every nutrient is targetable and bounded', () => {
    expect(TARGET_NUTRIENTS.length).toBeGreaterThan(0);
    for (const n of TARGET_NUTRIENTS) expect(n.max).toBeGreaterThan(0);
    expect(TARGET_NUTRIENTS.filter((n) => n.isMacro).map((n) => n.key)).toEqual([
      'calories',
      'fatGrams',
      'carbsGrams',
      'proteinGrams',
    ]);
  });
});
