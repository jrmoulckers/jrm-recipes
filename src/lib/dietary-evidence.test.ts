import { describe, expect, it } from 'vitest';

import type { DietaryIngredientEvidence, DietaryIngredientInput } from './dietary-assessment';
import {
  aggregateDietaryEvidence,
  assessIngredientsDeterministically,
  deterministicEvidenceForIngredient,
} from './dietary-evidence';

function ingredient(
  item: string,
  linkedFood: DietaryIngredientInput['linkedFood'] = null,
): DietaryIngredientInput {
  return {
    ingredientId: `ingredient_${item.replace(/\W/g, '_').slice(0, 12)}`,
    item,
    amount: 1,
    amountMax: null,
    unit: null,
    prep: null,
    linkedFood,
  };
}

function finding(
  ingredientId: string,
  value: DietaryIngredientEvidence['finding'],
  overrides: Partial<DietaryIngredientEvidence> = {},
): DietaryIngredientEvidence {
  return {
    ingredientId,
    ruleId: 'allergen:wheat',
    finding: value,
    source: 'on-device',
    material: true,
    foodId: null,
    correctionId: null,
    ...overrides,
  };
}

describe('deterministic dietary evidence', () => {
  it('makes unmatched ingredient text unresolved rather than absent', () => {
    const result = assessIngredientsDeterministically(
      [ingredient('mystery seasoning blend')],
      'allergen:wheat',
    );
    expect(result).toMatchObject({
      verdict: 'unknown',
      confidence: 'needs-review',
      coveredIngredientCount: 0,
    });
    expect(result.evidence).toContainEqual(
      expect.objectContaining({ finding: 'unresolved', material: true }),
    );
  });

  it('uses null vs [] food-allergen coverage without conflating them', () => {
    const base = {
      id: 'food_carrot',
      slug: 'carrot',
      category: 'produce-whole' as const,
    };
    const unknown = assessIngredientsDeterministically(
      [ingredient('carrot', { ...base, allergens: null })],
      'allergen:wheat',
    );
    const covered = assessIngredientsDeterministically(
      [ingredient('carrot', { ...base, allergens: [] })],
      'allergen:wheat',
    );
    expect(unknown).toMatchObject({ verdict: 'unknown', confidence: 'needs-review' });
    expect(covered).toMatchObject({ verdict: 'meets', confidence: 'high' });
  });

  it('emits both facts for contradictory linked and text evidence', () => {
    const evidence = deterministicEvidenceForIngredient(
      ingredient('gluten-free flour', {
        id: 'food_flour',
        slug: 'flour',
        category: 'baking',
        allergens: ['wheat'],
      }),
      'allergen:wheat',
    );
    expect(evidence.map((item) => item.finding)).toEqual(
      expect.arrayContaining(['present', 'absent']),
    );
    expect(
      aggregateDietaryEvidence({
        ruleId: 'allergen:wheat',
        ingredientIds: [evidence[0]!.ingredientId],
        evidence,
      }),
    ).toMatchObject({ verdict: 'conflicts', confidence: 'high' });
  });

  it('evaluates composition from canonical food categories and specific overrides', () => {
    expect(
      assessIngredientsDeterministically([ingredient('beef chuck')], 'composition:vegan'),
    ).toMatchObject({ verdict: 'conflicts', confidence: 'high' });
    expect(
      assessIngredientsDeterministically([ingredient('carrots')], 'composition:vegan'),
    ).toMatchObject({ verdict: 'meets', confidence: 'high' });
    expect(
      assessIngredientsDeterministically([ingredient('honey')], 'composition:vegan'),
    ).toMatchObject({ verdict: 'conflicts', confidence: 'high' });
    expect(
      assessIngredientsDeterministically([ingredient('salmon')], 'composition:pescatarian'),
    ).toMatchObject({ verdict: 'meets', confidence: 'high' });
  });

  it('deduplicates equivalent composition evidence before persistence', () => {
    const result = assessIngredientsDeterministically([ingredient('milk')], 'composition:vegan');
    expect(result.evidence).toHaveLength(1);
    expect(result).toMatchObject({ verdict: 'conflicts', confidence: 'high' });
  });

  it('never infers confirmation-only standards', () => {
    expect(
      assessIngredientsDeterministically([ingredient('rice')], 'confirmation:celiac-safe'),
    ).toMatchObject({ verdict: 'unknown', confidence: 'needs-review' });
  });
});

describe('dietary evidence aggregation', () => {
  it('lets a definite conflict veto confirmations and model output', () => {
    const id = 'ingredient_1';
    const result = aggregateDietaryEvidence({
      ruleId: 'allergen:wheat',
      ingredientIds: [id],
      evidence: [
        finding(id, 'absent', { source: 'author-confirmed' }),
        finding(id, 'absent', { source: 'on-device' }),
        finding(id, 'present', { source: 'text-match' }),
      ],
    });
    expect(result).toMatchObject({ verdict: 'conflicts', confidence: 'high' });
  });

  it('keeps contradictory non-deterministic findings at needs-review', () => {
    const id = 'ingredient_1';
    const result = aggregateDietaryEvidence({
      ruleId: 'allergen:wheat',
      ingredientIds: [id],
      evidence: [
        finding(id, 'present', { source: 'on-device' }),
        finding(id, 'absent', { source: 'author-confirmed' }),
      ],
    });

    expect(result).toMatchObject({ verdict: 'unknown', confidence: 'needs-review' });
  });

  it('lets reviewed evidence resolve uncertainty without overriding a conflict', () => {
    const id = 'ingredient_1';
    expect(
      aggregateDietaryEvidence({
        ruleId: 'allergen:wheat',
        ingredientIds: [id],
        evidence: [
          finding(id, 'unresolved', { source: 'text-match' }),
          finding(id, 'absent', {
            source: 'ingredient-correction',
            correctionId: 'correction_1',
          }),
        ],
      }),
    ).toMatchObject({ verdict: 'meets', confidence: 'high' });
  });

  it('treats a correction as replacement evidence for that ingredient and rule', () => {
    const id = 'ingredient_1';
    const result = aggregateDietaryEvidence({
      ruleId: 'allergen:wheat',
      ingredientIds: [id],
      evidence: [
        finding(id, 'present', { source: 'text-match' }),
        finding(id, 'absent', {
          source: 'ingredient-correction',
          correctionId: 'correction_1',
        }),
      ],
    });
    expect(result).toMatchObject({
      verdict: 'meets',
      confidence: 'high',
      coveredIngredientCount: 1,
    });
  });

  it('counts a definite conflict as covered evidence', () => {
    const id = 'ingredient_1';
    expect(
      aggregateDietaryEvidence({
        ruleId: 'allergen:wheat',
        ingredientIds: [id],
        evidence: [finding(id, 'present', { source: 'text-match' })],
      }),
    ).toMatchObject({
      verdict: 'conflicts',
      confidence: 'high',
      coveredIngredientCount: 1,
    });
  });

  it('never averages possible or material unresolved evidence away', () => {
    const result = aggregateDietaryEvidence({
      ruleId: 'allergen:wheat',
      ingredientIds: ['known_1', 'known_2', 'possible'],
      evidence: [
        finding('known_1', 'absent'),
        finding('known_2', 'absent'),
        finding('possible', 'possible'),
      ],
    });
    expect(result).toMatchObject({
      verdict: 'unknown',
      confidence: 'needs-review',
      coveredIngredientCount: 2,
    });
  });

  it('uses medium only for explicitly non-material ambiguity', () => {
    const result = aggregateDietaryEvidence({
      ruleId: 'allergen:wheat',
      ingredientIds: ['known', 'limited'],
      evidence: [finding('known', 'absent'), finding('limited', 'unresolved', { material: false })],
    });
    expect(result).toMatchObject({ verdict: 'meets', confidence: 'medium' });
  });

  it('treats missing and empty ingredient evidence as needs-review', () => {
    expect(
      aggregateDietaryEvidence({
        ruleId: 'allergen:wheat',
        ingredientIds: ['missing'],
        evidence: [],
      }),
    ).toMatchObject({ verdict: 'unknown', confidence: 'needs-review' });
    expect(
      aggregateDietaryEvidence({
        ruleId: 'allergen:wheat',
        ingredientIds: [],
        evidence: [],
      }),
    ).toMatchObject({ verdict: 'unknown', confidence: 'needs-review' });
  });

  it('rejects duplicate ingredient identities instead of hiding coverage gaps', () => {
    expect(() =>
      aggregateDietaryEvidence({
        ruleId: 'allergen:wheat',
        ingredientIds: ['duplicate', 'duplicate'],
        evidence: [],
      }),
    ).toThrow('Ingredient ids must be unique');
  });
});
