import { describe, expect, it } from 'vitest';

import { CONFIDENCE_WEIGHT } from './food-grams';
import {
  NUTRITION_ALGORITHM_VERSION,
  nutritionInputsFingerprint,
  nutritionResolverVersion,
} from './nutrition-version';

/**
 * The resolver version is the thing that makes a derived nutrition cache safe to
 * keep (#1044). These tests are less about the string and more about its
 * *coverage*: a fingerprint that silently stopped including portion weights
 * would still look like a perfectly good version while quietly serving numbers
 * from a resolver that no longer exists.
 *
 * So each input named in the issue is asserted to be present in the digest by a
 * value only that input could have contributed.
 */
describe('nutritionResolverVersion', () => {
  it('is shaped `n<algorithm>.<content hash>`', () => {
    expect(nutritionResolverVersion()).toMatch(/^n\d+\.[0-9a-z]+$/);
    expect(nutritionResolverVersion().startsWith(`n${NUTRITION_ALGORITHM_VERSION}.`)).toBe(true);
  });

  it('fits the `resolver_version` column', () => {
    expect(nutritionResolverVersion().length).toBeLessThanOrEqual(40);
  });

  it('is stable across calls (memoized, not recomputed differently)', () => {
    expect(nutritionResolverVersion()).toBe(nutritionResolverVersion());
  });
});

describe('nutritionInputsFingerprint covers every input that changes the answer', () => {
  const fingerprint = nutritionInputsFingerprint();

  it('includes the curated portion weights', () => {
    // #1030 revises these against the real USDA `food_portion.csv`; each edit
    // has to move the version with no constant to remember.
    expect(fingerprint).toContain('portions:');
    expect(fingerprint).toMatch(/garlic\|clove\|\d+\.\d{6}\|/);
  });

  it('includes the per-food densities', () => {
    expect(fingerprint).toContain('densities:');
    expect(fingerprint).toContain('water|1.000000');
  });

  it('includes the curated per-100 g facts and their provenance', () => {
    expect(fingerprint).toContain('facts:');
    // Every fact line carries one slot per registry nutrient, `~` for absent.
    expect(fingerprint).toMatch(/facts:[^\n]*\|[\d.~]+(\/[\d.~]+){7}\|/);
  });

  it('includes the confidence tiers', () => {
    expect(fingerprint).toContain(`portion|${CONFIDENCE_WEIGHT.portion.toFixed(6)}`);
    expect(fingerprint).toContain(`density|${CONFIDENCE_WEIGHT.density.toFixed(6)}`);
    expect(fingerprint).toContain('exact|1.000000');
  });

  it('includes the nutrient registry, ids and daily values alike', () => {
    expect(fingerprint).toContain('nutrients:');
    expect(fingerprint).toContain('satFatG|saturatedFatGrams|g|~|1');
    expect(fingerprint).toContain('sodiumMg|sodiumMg|mg|2300.000000|0');
  });

  it('renders absent numbers as `~` while a genuine zero stays `0.000000`', () => {
    // A food with no density must not be indistinguishable from one whose
    // density is genuinely zero — the same absent-vs-zero rule the cache itself
    // has to honour. Both spellings are present in the live data (apple has no
    // density; salt has 0 kcal), so this asserts they stay distinct.
    expect(fingerprint).toContain('apple|~');
    expect(fingerprint).toContain('none|0.000000');
  });

  it('is deterministic within a process', () => {
    expect(nutritionInputsFingerprint()).toBe(fingerprint);
  });

  it('is sorted at every level, so input order alone cannot move it', () => {
    for (const section of fingerprint.split('\n')) {
      const body = /^[a-z]+:(.*)$/s.exec(section)![1]!;
      const entries = body.split(',');
      expect(entries.length).toBeGreaterThan(1);
      expect([...entries].sort()).toEqual(entries);
    }
  });
});
