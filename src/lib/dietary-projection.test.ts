import { describe, expect, it } from 'vitest';

import {
  projectLegacyDietaryTags,
  selectEffectiveDietaryAssessment,
  type DietaryAssessmentProjectionInput,
} from './dietary-projection';

function assessment(
  overrides: Partial<DietaryAssessmentProjectionInput> = {},
): DietaryAssessmentProjectionInput {
  return {
    ruleId: 'allergen:wheat',
    customRestrictionId: null,
    scope: 'canonical',
    source: 'deterministic',
    verdict: 'unknown',
    confidence: 'needs-review',
    invalidatedAt: null,
    ...overrides,
  };
}

describe('selectEffectiveDietaryAssessment', () => {
  it('keeps deterministic conflicts above confirmation and model evidence', () => {
    expect(
      selectEffectiveDietaryAssessment([
        assessment({ source: 'author-confirmed', verdict: 'meets', confidence: null }),
        assessment({ source: 'on-device', verdict: 'meets', confidence: 'high' }),
        assessment({ source: 'deterministic', verdict: 'conflicts', confidence: 'high' }),
      ]),
    ).toMatchObject({ source: 'deterministic', verdict: 'conflicts', confidence: 'high' });
  });

  it('lets author confirmation resolve deterministic uncertainty', () => {
    expect(
      selectEffectiveDietaryAssessment([
        assessment(),
        assessment({ source: 'author-confirmed', verdict: 'meets', confidence: null }),
      ]),
    ).toMatchObject({ source: 'author-confirmed', confidence: null });
  });

  it('never hides an on-device conflict behind a deterministic match', () => {
    expect(
      selectEffectiveDietaryAssessment([
        assessment({ source: 'deterministic', verdict: 'meets', confidence: 'high' }),
        assessment({ source: 'on-device', verdict: 'conflicts', confidence: 'high' }),
      ]),
    ).toMatchObject({ source: 'on-device', verdict: 'conflicts', confidence: 'high' });
  });
});

describe('projectLegacyDietaryTags', () => {
  it('projects only high canonical deterministic results', () => {
    expect(
      projectLegacyDietaryTags([
        assessment({ ruleId: 'allergen:dairy', verdict: 'meets', confidence: 'high' }),
        assessment({ ruleId: 'allergen:wheat', verdict: 'meets', confidence: 'medium' }),
        assessment({
          ruleId: 'allergen:egg',
          scope: 'personal',
          verdict: 'meets',
          confidence: 'high',
        }),
      ]),
    ).toEqual(['dairy-free']);
  });

  it('does not project a tag when a deterministic conflict also exists', () => {
    expect(
      projectLegacyDietaryTags([
        assessment({ verdict: 'meets', confidence: 'high' }),
        assessment({ verdict: 'conflicts', confidence: 'high' }),
      ]),
    ).toEqual([]);
  });

  it('does not project a tag when an on-device assessment conflicts', () => {
    expect(
      projectLegacyDietaryTags([
        assessment({ verdict: 'meets', confidence: 'high' }),
        assessment({ source: 'on-device', verdict: 'conflicts', confidence: 'high' }),
      ]),
    ).toEqual([]);
  });

  it('keeps the deterministic compatibility tag alongside author confirmation', () => {
    expect(
      projectLegacyDietaryTags([
        assessment({ verdict: 'meets', confidence: 'high' }),
        assessment({ source: 'author-confirmed', verdict: 'meets', confidence: null }),
      ]),
    ).toEqual(['gluten-free']);
  });
});
