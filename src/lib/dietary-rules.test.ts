import { describe, expect, it } from 'vitest';

import { ALLERGENS } from './allergens';
import {
  BUILT_IN_DIETARY_RULES,
  DIETARY_ALGORITHM_VERSION,
  dietaryRulesetInputsFingerprint,
  dietaryRulesetVersion,
  getBuiltInDietaryRule,
} from './dietary-rules';

describe('built-in dietary rule registry', () => {
  it('contains every major allergen plus composition and confirmation-only rules', () => {
    expect(
      BUILT_IN_DIETARY_RULES.filter((rule) => rule.kind === 'allergen').map(
        (rule) => rule.allergen,
      ),
    ).toEqual(ALLERGENS);
    expect(
      BUILT_IN_DIETARY_RULES.filter((rule) => rule.kind === 'composition').map((r) => r.id),
    ).toEqual(['composition:vegan', 'composition:vegetarian', 'composition:pescatarian']);
    expect(
      BUILT_IN_DIETARY_RULES.filter((rule) => rule.kind === 'confirmation-only').map(
        (rule) => rule.id,
      ),
    ).toEqual(['confirmation:celiac-safe', 'confirmation:kosher', 'confirmation:halal']);
    expect(new Set(BUILT_IN_DIETARY_RULES.map((rule) => rule.id)).size).toBe(
      BUILT_IN_DIETARY_RULES.length,
    );
  });

  it('looks up stable rule ids without coupling to DietaryTag', () => {
    expect(getBuiltInDietaryRule('allergen:wheat')).toMatchObject({
      kind: 'allergen',
      allergen: 'wheat',
    });
    expect(getBuiltInDietaryRule('not-a-rule')).toBeUndefined();
  });
});

describe('dietary ruleset version', () => {
  const fingerprint = dietaryRulesetInputsFingerprint();

  it('combines a hand-bumped algorithm version with an automatic content hash', () => {
    expect(dietaryRulesetVersion()).toMatch(/^d\d+\.[0-9a-z]+$/);
    expect(dietaryRulesetVersion().startsWith(`d${DIETARY_ALGORITHM_VERSION}.`)).toBe(true);
    expect(dietaryRulesetVersion().length).toBeLessThanOrEqual(80);
    expect(dietaryRulesetVersion()).toBe(dietaryRulesetVersion());
  });

  it('covers the rule registry, allergen matcher, food-allergen facts, and food graph', () => {
    expect(fingerprint).toContain('registry:allergen:');
    expect(fingerprint).toContain('composition:vegan');
    expect(fingerprint).toContain('confirmation:celiac-safe');
    expect(fingerprint).toContain('allergen-text:');
    expect(fingerprint).toContain('soy sauce');
    expect(fingerprint).toContain('food-allergens:');
    expect(fingerprint).toContain('soy-sauce|soy/wheat');
    expect(fingerprint).toContain('food-graph:');
    expect(fingerprint).toContain('honey|sweetener');
    expect(fingerprint).toContain('honey|composition:vegan|present');
  });

  it('serializes each comma-delimited section deterministically', () => {
    for (const section of fingerprint.split('\n')) {
      const body = section.slice(section.indexOf(':') + 1);
      const entries = body.split(',');
      expect([...entries].sort()).toEqual(entries);
    }
  });
});
