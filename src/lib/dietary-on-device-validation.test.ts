import { describe, expect, it } from 'vitest';

import type { OnDeviceDietarySubmission } from './dietary-assessment';
import { assertOnDeviceSubmissionContext } from './dietary-on-device-validation';

const submission: OnDeviceDietarySubmission = {
  recipeId: 'recipe_1',
  ingredientFingerprint: 'i1.current',
  analyzerVersion: 'model.current',
  rulesetVersion: 'rules.current',
  evidence: [
    {
      ingredientId: 'ingredient_1',
      foodId: 'food_1',
      ruleId: 'allergen:wheat',
      finding: 'present',
    },
  ],
};

function validate(overrides: Partial<Parameters<typeof assertOnDeviceSubmissionContext>[0]> = {}) {
  return () =>
    assertOnDeviceSubmissionContext({
      submission,
      expectedFingerprint: 'i1.current',
      expectedRulesetVersion: 'rules.current',
      allowedAnalyzerVersions: new Set(['model.current']),
      ingredientIds: new Set(['ingredient_1']),
      foodIds: new Set(['food_1']),
      ...overrides,
    });
}

describe('on-device dietary sync boundary', () => {
  it('accepts current, authorized structured evidence', () => {
    expect(validate()).not.toThrow();
  });

  it.each([
    ['stale ingredient fingerprint', { expectedFingerprint: 'i1.new' }],
    ['stale ruleset', { expectedRulesetVersion: 'rules.new' }],
    ['unapproved analyzer', { allowedAnalyzerVersions: new Set(['model.new']) }],
    ['unknown ingredient', { ingredientIds: new Set(['ingredient_other']) }],
    ['unknown food node', { foodIds: new Set(['food_other']) }],
  ])('rejects %s', (_name, overrides) => {
    expect(validate(overrides)).toThrow(RangeError);
  });
});
