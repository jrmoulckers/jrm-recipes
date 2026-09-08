export const DIETARY_RULE_KINDS = ['allergen', 'composition', 'confirmation-only'] as const;
export type DietaryRuleKind = (typeof DIETARY_RULE_KINDS)[number];

export const DIETARY_VERDICTS = ['meets', 'conflicts', 'unknown'] as const;
export type DietaryVerdict = (typeof DIETARY_VERDICTS)[number];

export const DIETARY_CONFIDENCES = ['high', 'medium', 'needs-review'] as const;
export type DietaryConfidence = (typeof DIETARY_CONFIDENCES)[number];

export const DIETARY_EVIDENCE_FINDINGS = ['present', 'absent', 'possible', 'unresolved'] as const;
export type DietaryEvidenceFinding = (typeof DIETARY_EVIDENCE_FINDINGS)[number];

export const DIETARY_EVIDENCE_SOURCES = [
  'food-link',
  'text-match',
  'on-device',
  'author-confirmed',
  'ingredient-correction',
  'certification',
] as const;
export type DietaryEvidenceSource = (typeof DIETARY_EVIDENCE_SOURCES)[number];

export const DIETARY_ASSESSMENT_SOURCES = [
  'deterministic',
  'on-device',
  'author-confirmed',
] as const;
export type DietaryAssessmentSource = (typeof DIETARY_ASSESSMENT_SOURCES)[number];

export const DIETARY_ASSESSMENT_SCOPES = ['canonical', 'personal', 'profile'] as const;
export type DietaryAssessmentScope = (typeof DIETARY_ASSESSMENT_SCOPES)[number];

export const CUSTOM_RESTRICTION_SEVERITIES = [
  'allergy-intolerance',
  'strict-avoidance',
  'preference',
] as const;
export type CustomRestrictionSeverity = (typeof CUSTOM_RESTRICTION_SEVERITIES)[number];
