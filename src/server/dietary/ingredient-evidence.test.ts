import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./assessments', () => ({ listDietaryAssessmentsForViewer: vi.fn() }));

import { projectIngredientDietaryEvidence } from './ingredient-evidence';

describe('projectIngredientDietaryEvidence', () => {
  it('preserves present, possible, and unresolved findings', () => {
    const projected = projectIngredientDietaryEvidence([
      {
        ruleId: 'allergen:wheat',
        customRestrictionId: null,
        scope: 'canonical',
        source: 'deterministic',
        verdict: 'conflicts',
        confidence: 'high',
        invalidatedAt: null,
        evidence: [
          { ingredientId: 'one', finding: 'present', source: 'text-match' },
          { ingredientId: 'two', finding: 'possible', source: 'on-device' },
          { ingredientId: 'three', finding: 'unresolved', source: 'text-match' },
        ],
      },
    ]);

    expect(projected.map(({ finding }) => finding)).toEqual(['present', 'possible', 'unresolved']);
  });

  it('keeps a recipe-local absent correction available for later revision', () => {
    expect(
      projectIngredientDietaryEvidence([
        {
          ruleId: 'allergen:wheat',
          customRestrictionId: null,
          scope: 'canonical',
          source: 'deterministic',
          verdict: 'meets',
          confidence: 'high',
          invalidatedAt: null,
          evidence: [
            { ingredientId: 'one', finding: 'present', source: 'text-match' },
            { ingredientId: 'one', finding: 'absent', source: 'ingredient-correction' },
          ],
        },
      ]),
    ).toEqual([
      {
        ingredientId: 'one',
        ruleId: 'allergen:wheat',
        finding: 'absent',
        source: 'ingredient-correction',
      },
    ]);
  });
});
