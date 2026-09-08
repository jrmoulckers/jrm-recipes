import { describe, expect, it } from 'vitest';

import {
  ingredientMatchesExactTerm,
  summarizeCardDietaryProfile,
  type CardDietaryData,
  type DietaryProfileView,
} from './dietary-presentation';

const profile: DietaryProfileView = {
  id: 'profile_1',
  name: 'Ada',
  allergens: ['dairy'],
  diets: ['vegetarian'],
  customRestrictions: [],
};

const ingredients = [
  { id: 'ingredient_1', name: 'olive oil' },
  { id: 'ingredient_2', name: 'seasoning blend' },
];

function data(overrides: Partial<CardDietaryData['assessments'][number]>[] = []): CardDietaryData {
  return {
    ingredients,
    assessments: [
      {
        ruleId: 'allergen:dairy',
        source: 'deterministic',
        verdict: 'meets',
        confidence: 'high',
        recognizedIngredients: 2,
        totalIngredients: 2,
        attentionIngredients: [],
      },
      {
        ruleId: 'composition:vegetarian',
        source: 'deterministic',
        verdict: 'meets',
        confidence: 'high',
        recognizedIngredients: 2,
        totalIngredients: 2,
        attentionIngredients: [],
      },
      ...overrides.map((override) => ({
        ruleId: 'allergen:dairy',
        source: 'deterministic' as const,
        verdict: 'meets' as const,
        confidence: 'high' as const,
        recognizedIngredients: 2,
        totalIngredients: 2,
        attentionIngredients: [],
        ...override,
      })),
    ],
  };
}

describe('ingredientMatchesExactTerm', () => {
  it('matches complete normalized phrases without broadening to substrings', () => {
    expect(ingredientMatchesExactTerm('2 cups sliced mushrooms', 'mushrooms')).toBe(true);
    expect(ingredientMatchesExactTerm('mushroom-seasoning', 'mushroom seasoning')).toBe(true);
    expect(ingredientMatchesExactTerm('button mushrooms', 'mush')).toBe(false);
  });
});

describe('summarizeCardDietaryProfile', () => {
  it('returns a high suitability result only when every required rule is high', () => {
    expect(summarizeCardDietaryProfile(profile, data())).toMatchObject({
      status: 'suitability',
      confidence: 'high',
      recognizedIngredients: 2,
      detailsCount: 2,
    });
  });

  it('lets a deterministic conflict veto another positive assessment', () => {
    expect(
      summarizeCardDietaryProfile(
        profile,
        data([
          {
            verdict: 'conflicts',
            confidence: 'high',
            attentionIngredients: [
              { ingredientId: 'ingredient_2', name: 'seasoning blend', kind: 'conflict' },
            ],
          },
        ]),
      ),
    ).toMatchObject({
      status: 'conflict',
      attentionIngredients: [{ ingredientId: 'ingredient_2', kind: 'conflict' }],
    });
  });

  it('fails closed when a required assessment is absent', () => {
    expect(
      summarizeCardDietaryProfile(profile, {
        ingredients,
        assessments: data().assessments.filter(
          (assessment) => assessment.ruleId !== 'allergen:dairy',
        ),
      }),
    ).toMatchObject({ status: 'review', confidence: 'needs-review' });
  });

  it('lets author confirmation resolve uncertainty while conflicts still win', () => {
    const result = summarizeCardDietaryProfile(
      { ...profile, diets: [] },
      data([
        {
          source: 'author-confirmed',
          verdict: 'meets',
          confidence: null,
        },
        {
          source: 'deterministic',
          verdict: 'unknown',
          confidence: 'needs-review',
        },
      ]),
    );
    expect(result).toMatchObject({
      status: 'suitability',
      provenance: 'author-confirmed',
    });
  });

  it('fails closed for blocking custom restrictions when ingredients are empty', () => {
    expect(
      summarizeCardDietaryProfile(
        {
          ...profile,
          allergens: [],
          diets: [],
          customRestrictions: [
            {
              id: 'restriction_1',
              name: 'No mushrooms',
              severity: 'allergy-intolerance',
              terms: ['mushrooms'],
            },
          ],
        },
        { ingredients: [], assessments: [] },
      ),
    ).toMatchObject({
      status: 'review',
      confidence: 'needs-review',
      recognizedIngredients: 0,
    });
  });

  it('applies exact custom restrictions and keeps preference matches non-blocking', () => {
    const customProfile: DietaryProfileView = {
      ...profile,
      allergens: [],
      diets: [],
      customRestrictions: [
        {
          id: 'restriction_1',
          name: 'No mushrooms',
          severity: 'allergy-intolerance',
          terms: ['mushrooms'],
        },
        {
          id: 'restriction_2',
          name: 'Avoid olives',
          severity: 'preference',
          terms: ['olives'],
        },
      ],
    };
    const result = summarizeCardDietaryProfile(customProfile, {
      ingredients: [
        { id: 'ingredient_1', name: 'green olives' },
        { id: 'ingredient_2', name: 'mushrooms' },
      ],
      assessments: [],
    });
    expect(result).toMatchObject({
      status: 'conflict',
      preferenceMatches: 1,
      detailsCount: 2,
    });
  });
});
