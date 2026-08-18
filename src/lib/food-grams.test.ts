import { describe, expect, it } from 'vitest';

import { foodSlug } from './food-db';
import { resolveGramsForFood, resolveGramsForSlug, CONFIDENCE_WEIGHT } from './food-grams';
import { allPortions, normalizePortionUnit, portionForFood } from './food-portions';

describe('the count → grams gap this module exists to close', () => {
  // Each of these resolved to `null` before food_portions existed, and so
  // contributed exactly nothing to a recipe's nutrition. They are the reason
  // the overhaul happened; if any regresses, the estimate is silently wrong.
  it.each([
    ['2 eggs', 'egg', 2, 'each', 100],
    ['3 cloves of garlic', 'garlic', 3, 'cloves', 9],
    ['1 medium onion', 'onion', 1, 'each', 110],
    ['1 bunch parsley', 'parsley', 1, 'bunch', 60],
    ['2 carrots', 'carrot', 2, 'each', 122],
    ['1 sprig thyme', 'thyme', 1, 'sprig', 0.3],
    ['a pinch of salt', 'salt', 1, 'pinch', 0.36],
    ['1 can chickpeas', 'chickpeas', 1, 'can', 254],
  ])('resolves %s', (_label, item, qty, unit, expected) => {
    const got = resolveGramsForFood(item, qty, unit);
    expect(got).not.toBeNull();
    expect(got?.grams).toBeCloseTo(expected, 5);
    expect(got?.confidence).toBe('portion');
  });

  it('rescues density-less volume lines that used to fall through', () => {
    // Cheese, fresh herbs and dry pasta carry no `densityGPerMl`, so every
    // cup/tbsp measure of them previously resolved to null.
    expect(resolveGramsForFood('shredded cheese', 1, 'cup')?.grams).toBeCloseTo(113, 5);
    expect(resolveGramsForFood('pasta', 2, 'cup')?.grams).toBeCloseTo(200, 5);
    expect(resolveGramsForFood('chopped cilantro', 2, 'tbsp')?.grams).toBeCloseTo(2, 5);
  });
});

describe('resolveGramsForSlug precedence', () => {
  const onion = foodSlug('Onion');

  it('prefers mass arithmetic over everything else', () => {
    const got = resolveGramsForSlug(onion, 2, 'kg', 0.5);
    expect(got).toEqual({ grams: 2000, confidence: 'exact' });
  });

  it('prefers a curated portion over a generic density', () => {
    // Onion has a curated `cup, chopped` of 160 g. Even when handed a density
    // that would compute a different answer, the measured portion wins.
    const got = resolveGramsForSlug(onion, 1, 'cup', 0.5);
    expect(got?.confidence).toBe('portion');
    expect(got?.grams).toBeCloseTo(160, 5);
  });

  it('falls back to density when no portion covers the unit', () => {
    const got = resolveGramsForSlug(foodSlug('Milk'), 1, 'cup', 1.03);
    expect(got?.confidence).toBe('density');
    expect(got?.grams).toBeCloseTo(243.8, 0);
  });

  it('resolves a mass unit even for an unmatched food', () => {
    // 500 g weighs 500 g regardless of what it is.
    expect(resolveGramsForSlug(null, 500, 'g', null)).toEqual({
      grams: 500,
      confidence: 'exact',
    });
  });

  it('returns null rather than zero when no path exists', () => {
    expect(resolveGramsForSlug(null, 1, 'splash', null)).toBeNull();
    expect(resolveGramsForSlug(foodSlug('Beef'), 1, 'each', null)).toBeNull();
  });

  it('treats a non-positive or non-finite density as absent', () => {
    expect(resolveGramsForSlug(foodSlug('Milk'), 1, 'cup', 0)).toBeNull();
    expect(resolveGramsForSlug(foodSlug('Milk'), 1, 'cup', -1)).toBeNull();
    expect(resolveGramsForSlug(foodSlug('Milk'), 1, 'cup', Number.NaN)).toBeNull();
  });

  it('rejects a missing, negative or non-finite quantity', () => {
    for (const q of [null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveGramsForSlug(onion, q, 'each', null)).toBeNull();
    }
  });

  it('resolves a zero quantity to zero grams, not to null', () => {
    // Zero is a legitimate amount; only *unknown* weights may be null.
    expect(resolveGramsForSlug(onion, 0, 'each', null)).toEqual({
      grams: 0,
      confidence: 'portion',
      portion: expect.objectContaining({ unit: 'each' }),
    });
  });

  it('scales linearly with quantity', () => {
    const one = resolveGramsForSlug(onion, 1, 'each', null)!.grams;
    const seven = resolveGramsForSlug(onion, 7, 'each', null)!.grams;
    expect(seven).toBeCloseTo(one * 7, 5);
  });
});

describe('unit normalization', () => {
  it('folds plurals onto the singular stored token', () => {
    expect(normalizePortionUnit('Cloves')).toBe('clove');
    expect(normalizePortionUnit(' SPRIGS ')).toBe('sprig');
    expect(normalizePortionUnit('slices')).toBe('slice');
    expect(normalizePortionUnit('bunches')).toBe('bunch');
  });

  it('leaves already-singular and short tokens alone', () => {
    expect(normalizePortionUnit('clove')).toBe('clove');
    expect(normalizePortionUnit('each')).toBe('each');
    expect(normalizePortionUnit('tbsp')).toBe('tbsp');
    expect(normalizePortionUnit('can')).toBe('can');
  });

  it('is empty for nullish input', () => {
    expect(normalizePortionUnit(null)).toBe('');
    expect(normalizePortionUnit(undefined)).toBe('');
    expect(normalizePortionUnit('  ')).toBe('');
  });
});

describe('the portion dataset', () => {
  it('keys every portion onto a real canonical food slug', () => {
    const all = allPortions();
    expect(all.length).toBeGreaterThan(100);
    for (const { slug, portion } of all) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(portion.gramsPerUnit).toBeGreaterThan(0);
      expect(Number.isFinite(portion.gramsPerUnit)).toBe(true);
      expect(['usda', 'kitchen']).toContain(portion.source);
    }
  });

  it('covers `each` for every food the editor defaults to counting', () => {
    // food-units.ts suggests `each` as the *default* unit for whole produce,
    // fruit and eggs. Any gap here is a line the editor invites a cook to write
    // and the roll-up then cannot weigh.
    for (const item of ['onion', 'potato', 'tomato', 'apple', 'banana', 'egg', 'avocado']) {
      expect(portionForFood(item, 'each')).not.toBeNull();
    }
  });

  it('resolves a bare garlic `each` as a clove, not a head', () => {
    // Recipes overwhelmingly mean a clove. The head stays reachable explicitly.
    expect(portionForFood('garlic', 'each')?.gramsPerUnit).toBe(3);
    expect(portionForFood('garlic', 'head')?.gramsPerUnit).toBe(40);
  });

  it('orders the confidence weights strictly by trustworthiness', () => {
    expect(CONFIDENCE_WEIGHT.exact).toBeGreaterThan(CONFIDENCE_WEIGHT.portion);
    expect(CONFIDENCE_WEIGHT.portion).toBeGreaterThan(CONFIDENCE_WEIGHT.density);
    expect(CONFIDENCE_WEIGHT.density).toBeGreaterThan(CONFIDENCE_WEIGHT.none);
    expect(CONFIDENCE_WEIGHT.none).toBe(0);
  });
});
