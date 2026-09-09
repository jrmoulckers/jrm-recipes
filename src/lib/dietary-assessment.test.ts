import { describe, expect, it } from 'vitest';

import {
  algorithmicDietaryAssessmentSchema,
  customDietaryRestrictionInputSchema,
  dietaryAssessmentContractSchema,
  dietaryIngredientInputSchema,
  dietarySubjectScopeSchema,
  isLegalDietaryAssessment,
} from './dietary-assessment';

describe('dietary assessment contracts', () => {
  it.each([
    ['meets', 'high'],
    ['meets', 'medium'],
    ['unknown', 'needs-review'],
    ['conflicts', 'high'],
  ])('accepts the legal %s/%s pair', (verdict, confidence) => {
    expect(algorithmicDietaryAssessmentSchema.safeParse({ verdict, confidence }).success).toBe(
      true,
    );
  });

  it.each([
    ['meets', 'needs-review'],
    ['unknown', 'high'],
    ['unknown', 'medium'],
    ['conflicts', 'medium'],
    ['conflicts', 'needs-review'],
  ])('rejects the illegal %s/%s pair', (verdict, confidence) => {
    expect(isLegalDietaryAssessment({ verdict, confidence })).toBe(false);
  });

  it('rejects unstructured reasoning fields', () => {
    expect(
      isLegalDietaryAssessment({
        verdict: 'meets',
        confidence: 'high',
        reasoning: 'hidden model prose',
      }),
    ).toBe(false);
  });

  it('fails closed when custom processing is not declared self-scoped', () => {
    expect(dietarySubjectScopeSchema.safeParse('self').success).toBe(true);
    expect(dietarySubjectScopeSchema.safeParse(undefined).success).toBe(false);
    expect(dietarySubjectScopeSchema.safeParse('non-self').success).toBe(false);
    expect(dietarySubjectScopeSchema.safeParse('disputed').success).toBe(false);

    const restriction = {
      name: 'Avoid this ingredient',
      severity: 'strict-avoidance',
      terms: [{ term: 'example', source: 'exact', approved: true }],
    };
    expect(customDietaryRestrictionInputSchema.safeParse(restriction).success).toBe(false);
    expect(
      customDietaryRestrictionInputSchema.safeParse({
        ...restriction,
        subjectScope: 'self',
      }).success,
    ).toBe(true);
  });

  it('keeps confirmed suitability separate from algorithmic confidence', () => {
    const base = {
      recipeId: 'recipe_1',
      ruleId: 'allergen:wheat',
      customRestrictionId: null,
      scope: 'canonical',
      ownerUserId: null,
      profileId: null,
      ingredientFingerprint: 'i1.abc',
      analyzerVersion: 'author-v1',
      rulesetVersion: 'd1.abc',
      restrictionTermsVersion: null,
      evidenceIds: [],
      createdAt: new Date(),
      invalidatedAt: null,
    };

    expect(
      dietaryAssessmentContractSchema.safeParse({
        ...base,
        source: 'author-confirmed',
        outcome: { basis: 'confirmed', verdict: 'meets', confidence: null },
      }).success,
    ).toBe(true);
    expect(
      dietaryAssessmentContractSchema.safeParse({
        ...base,
        source: 'on-device',
        outcome: { basis: 'confirmed', verdict: 'meets', confidence: null },
      }).success,
    ).toBe(false);
  });

  it('enforces canonical, personal, and profile ownership boundaries', () => {
    const base = {
      recipeId: 'recipe_1',
      ruleId: 'allergen:wheat',
      customRestrictionId: null,
      source: 'deterministic',
      outcome: { basis: 'algorithmic', verdict: 'meets', confidence: 'high' },
      ingredientFingerprint: 'i1.abc',
      analyzerVersion: 'deterministic-v1',
      rulesetVersion: 'd1.abc',
      restrictionTermsVersion: null,
      evidenceIds: [],
      createdAt: new Date(),
      invalidatedAt: null,
    };
    const parse = (scope: string, ownerUserId: string | null, profileId: string | null) =>
      dietaryAssessmentContractSchema.safeParse({
        ...base,
        scope,
        ownerUserId,
        profileId,
      }).success;

    expect(parse('canonical', null, null)).toBe(true);
    expect(parse('personal', 'user_1', null)).toBe(true);
    expect(parse('profile', null, 'profile_1')).toBe(true);
    expect(parse('canonical', 'user_1', null)).toBe(false);
    expect(parse('personal', null, null)).toBe(false);
    expect(parse('profile', 'user_1', 'profile_1')).toBe(false);
  });

  it('requires custom assessments to be profile-scoped and terms-versioned', () => {
    const custom = {
      recipeId: 'recipe_1',
      ruleId: null,
      customRestrictionId: 'restriction_1',
      scope: 'profile',
      ownerUserId: null,
      profileId: 'profile_1',
      source: 'deterministic',
      outcome: { basis: 'algorithmic', verdict: 'unknown', confidence: 'needs-review' },
      ingredientFingerprint: 'i1.abc',
      analyzerVersion: 'deterministic-v1',
      rulesetVersion: 'd1.abc',
      restrictionTermsVersion: 'r1.abc',
      evidenceIds: [],
      createdAt: new Date(),
      invalidatedAt: null,
    };

    expect(dietaryAssessmentContractSchema.safeParse(custom).success).toBe(true);
    expect(
      dietaryAssessmentContractSchema.safeParse({
        ...custom,
        restrictionTermsVersion: null,
      }).success,
    ).toBe(false);
    expect(
      dietaryAssessmentContractSchema.safeParse({
        ...custom,
        scope: 'personal',
        ownerUserId: 'user_1',
        profileId: null,
      }).success,
    ).toBe(false);
  });

  it('validates the complete linked-food and amount range input', () => {
    expect(
      dietaryIngredientInputSchema.safeParse({
        ingredientId: 'ingredient_1',
        item: 'flour',
        amount: 2,
        amountMax: 1,
        unit: 'cup',
        prep: 'sifted',
        linkedFood: {
          id: 'food_flour',
          slug: 'flour',
          category: 'baking',
          allergens: ['wheat'],
        },
      }).success,
    ).toBe(false);
  });
});
