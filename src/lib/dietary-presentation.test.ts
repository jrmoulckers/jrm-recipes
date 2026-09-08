import { describe, expect, it } from 'vitest';

import {
  dietaryAssessmentStatus,
  effectiveDietaryAssessmentViews,
  isDefiniteDietaryMatch,
  isPossibleDietaryMatch,
  type DietaryAssessmentView,
} from './dietary-presentation';

function assessment(overrides: Partial<DietaryAssessmentView> = {}): DietaryAssessmentView {
  return {
    ruleId: 'allergen:wheat',
    scope: 'canonical',
    profileId: null,
    source: 'deterministic',
    verdict: 'meets',
    confidence: 'high',
    recognizedIngredients: 3,
    totalIngredients: 3,
    evidence: [],
    ...overrides,
  };
}

describe('dietary assessment presentation', () => {
  it('keeps deterministic conflicts ahead of author confirmation', () => {
    const effective = effectiveDietaryAssessmentViews([
      assessment({ source: 'author-confirmed', confidence: null }),
      assessment({ verdict: 'conflicts', confidence: 'high' }),
    ]);
    expect(effective).toHaveLength(1);
    expect(effective[0]).toMatchObject({ verdict: 'conflicts', source: 'deterministic' });
  });

  it('maps valid outcomes to text-backed status semantics', () => {
    expect(dietaryAssessmentStatus(assessment())).toBe('suitability');
    expect(dietaryAssessmentStatus(assessment({ confidence: 'medium' }))).toBe('suitability');
    expect(
      dietaryAssessmentStatus(assessment({ verdict: 'unknown', confidence: 'needs-review' })),
    ).toBe('review');
    expect(dietaryAssessmentStatus(assessment({ verdict: 'conflicts' }))).toBe('conflict');
  });

  it('separates definite and possible positive matches', () => {
    expect(isDefiniteDietaryMatch(assessment())).toBe(true);
    expect(isPossibleDietaryMatch(assessment())).toBe(false);
    expect(isDefiniteDietaryMatch(assessment({ confidence: 'medium' }))).toBe(false);
    expect(isPossibleDietaryMatch(assessment({ confidence: 'medium' }))).toBe(true);
  });
});
