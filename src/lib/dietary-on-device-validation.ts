import type { OnDeviceDietarySubmission } from './dietary-assessment';

export function assertOnDeviceSubmissionContext(input: {
  submission: OnDeviceDietarySubmission;
  expectedFingerprint: string;
  expectedRulesetVersion: string;
  allowedAnalyzerVersions: ReadonlySet<string>;
  ingredientIds: ReadonlySet<string>;
  foodIds: ReadonlySet<string>;
}): void {
  const {
    submission,
    expectedFingerprint,
    expectedRulesetVersion,
    allowedAnalyzerVersions,
    ingredientIds,
    foodIds,
  } = input;
  if (
    submission.ingredientFingerprint !== expectedFingerprint ||
    submission.rulesetVersion !== expectedRulesetVersion ||
    !allowedAnalyzerVersions.has(submission.analyzerVersion)
  ) {
    throw new RangeError('Stale or unsupported on-device analysis.');
  }
  for (const evidence of submission.evidence) {
    if (!ingredientIds.has(evidence.ingredientId) || !foodIds.has(evidence.foodId)) {
      throw new RangeError('On-device evidence references an unauthorized resource.');
    }
  }
}
