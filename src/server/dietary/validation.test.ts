import { describe, expect, it } from 'vitest';

import { memberProfileInput, nutritionTargetInput } from './validation';

describe('memberProfileInput', () => {
  it('accepts a minimal profile and defaults the lists', () => {
    const parsed = memberProfileInput.parse({ name: '  Theo  ' });
    expect(parsed).toMatchObject({
      name: 'Theo',
      allergens: [],
      diets: [],
    });
    expect(parsed.calorieGoal).toBeUndefined();
    expect(parsed.groupId).toBeUndefined();
  });

  it('requires a name', () => {
    expect(() => memberProfileInput.parse({ name: '   ' })).toThrow();
  });

  it('accepts and dedupes shared allergen + diet values', () => {
    const parsed = memberProfileInput.parse({
      name: 'Sam',
      allergens: ['peanut', 'peanut', 'shellfish'],
      diets: ['vegetarian', 'vegetarian'],
    });
    expect(parsed.allergens).toEqual(['peanut', 'shellfish']);
    expect(parsed.diets).toEqual(['vegetarian']);
  });

  it('rejects values that would drift from the shared unions', () => {
    expect(() => memberProfileInput.parse({ name: 'Bad', allergens: ['gluten'] })).toThrow();
    expect(() => memberProfileInput.parse({ name: 'Bad', diets: ['keto'] })).toThrow();
  });

  it('coerces a calorie goal from a form string', () => {
    expect(memberProfileInput.parse({ name: 'Ana', calorieGoal: '1800' }).calorieGoal).toBe(1800);
    expect(memberProfileInput.parse({ name: 'Ana', calorieGoal: '' }).calorieGoal).toBeUndefined();
  });

  it('rejects a non-integer or out-of-range calorie goal', () => {
    expect(() => memberProfileInput.parse({ name: 'Bad', calorieGoal: '-5' })).toThrow();
    expect(() => memberProfileInput.parse({ name: 'Bad', calorieGoal: '20001' })).toThrow();
    expect(() => memberProfileInput.parse({ name: 'Bad', calorieGoal: '12.5' })).toThrow();
  });

  it('treats a blank group as unscoped', () => {
    expect(memberProfileInput.parse({ name: 'Ana', groupId: '   ' }).groupId).toBeUndefined();
  });
});

describe('nutritionTargetInput', () => {
  const base = { profileId: 'p1', effectiveFrom: '2026-03-01' };

  it('coerces form strings and drops the blanks', () => {
    const parsed = nutritionTargetInput.parse({
      ...base,
      targets: { calories: '2200', proteinGrams: '150', fatGrams: '', carbsGrams: '   ' },
    });
    expect(parsed.targets).toEqual({ calories: 2200, proteinGrams: 150 });
  });

  it('rounds to the nutrient display precision', () => {
    const parsed = nutritionTargetInput.parse({
      ...base,
      targets: { calories: '2200.6', proteinGrams: '150.44' },
    });
    expect(parsed.targets).toEqual({ calories: 2201, proteinGrams: 150.4 });
  });

  it('defaults the effective date to today rather than leaving it unset', () => {
    const parsed = nutritionTargetInput.parse({ profileId: 'p1', targets: { calories: '2000' } });
    expect(parsed.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects an impossible effective date', () => {
    expect(() =>
      nutritionTargetInput.parse({ ...base, effectiveFrom: '2025-02-31', targets: {} }),
    ).toThrow();
  });

  it('rejects a negative or absurd target', () => {
    expect(() => nutritionTargetInput.parse({ ...base, targets: { calories: '-1' } })).toThrow();
    expect(() => nutritionTargetInput.parse({ ...base, targets: { calories: '99999' } })).toThrow();
    expect(() =>
      nutritionTargetInput.parse({ ...base, targets: { proteinGrams: 'lots' } }),
    ).toThrow();
  });

  it('accepts an entirely empty set, which is how a member clears their targets', () => {
    expect(nutritionTargetInput.parse({ ...base, targets: {} }).targets).toEqual({});
  });
});
