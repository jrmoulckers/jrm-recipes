import { describe, expect, it } from 'vitest';

import {
  USDA_MATERIAL_DIFFERENCE,
  USDA_PORTION_REFERENCES,
  auditRecordedUsdaReferences,
  isMaterialDifference,
} from '../../scripts/verify-food-portions-usda';
import { allPortions, portionForFood } from './food-portions';

describe('USDA portion validation', () => {
  it('records one authoritative reference for every USDA-labelled row', () => {
    expect(auditRecordedUsdaReferences()).toEqual([]);
    expect(allPortions().filter(({ portion }) => portion.source === 'usda')).toHaveLength(
      USDA_PORTION_REFERENCES.length,
    );
  });

  it('requires both a meaningful absolute and relative difference', () => {
    expect(USDA_MATERIAL_DIFFERENCE).toEqual({
      absoluteGrams: 2,
      relative: 0.1,
      extremeRelative: 0.5,
    });
    expect(isMaterialDifference(1.9, 1.6)).toBe(false);
    expect(isMaterialDifference(3.3, 1.7)).toBe(true);
    expect(isMaterialDifference(104, 133)).toBe(true);
  });

  it('contains the material corrections found by the audit', () => {
    expect(portionForFood('potato', 'each')?.gramsPerUnit).toBe(213);
    expect(portionForFood('cucumber', 'cup')?.gramsPerUnit).toBe(104);
    expect(portionForFood('avocado', 'each')?.gramsPerUnit).toBe(201);
    expect(portionForFood('corn', 'ear')?.gramsPerUnit).toBe(102);
    expect(portionForFood('mint', 'cup')?.gramsPerUnit).toBe(25.6);
    expect(portionForFood('rosemary', 'tbsp')?.gramsPerUnit).toBe(1.7);
    expect(portionForFood('dill', 'tbsp')?.gramsPerUnit).toBe(0.6);
    expect(portionForFood('cheese', 'slice')?.gramsPerUnit).toBe(28);
    expect(portionForFood('mussels', 'each')?.gramsPerUnit).toBe(10);
  });

  it('keeps unsupported hand estimates out of USDA provenance', () => {
    for (const [food, unit] of [
      ['garlic', 'head'],
      ['shallot', 'each'],
      ['broccoli', 'head'],
      ['berries', 'each'],
      ['fish', 'fillet'],
      ['red pepper flakes', 'tsp'],
    ] as const) {
      expect(portionForFood(food, unit)?.source).toBe('kitchen');
    }
  });
});
