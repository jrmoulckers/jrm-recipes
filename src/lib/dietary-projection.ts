import type {
  DietaryAssessmentScope,
  DietaryAssessmentSource,
  DietaryConfidence,
  DietaryVerdict,
} from './dietary-assessment';
import type { DietaryTag } from './substitutions';

export type DietaryAssessmentProjectionInput = {
  ruleId: string | null;
  customRestrictionId: string | null;
  scope: DietaryAssessmentScope;
  source: DietaryAssessmentSource;
  verdict: DietaryVerdict;
  confidence: DietaryConfidence | null;
  invalidatedAt: Date | null;
};

const LEGACY_DERIVED_RULES = {
  'allergen:dairy': 'dairy-free',
  'allergen:wheat': 'gluten-free',
  'allergen:egg': 'egg-free',
} as const satisfies Partial<Record<string, DietaryTag>>;

const DIETARY_TAG_RULES = {
  vegan: ['composition:vegan'],
  vegetarian: ['composition:vegetarian'],
  'dairy-free': ['allergen:dairy'],
  'gluten-free': ['allergen:wheat'],
  'egg-free': ['allergen:egg'],
  'nut-free': ['allergen:peanut', 'allergen:tree-nut'],
  'soy-free': ['allergen:soy'],
  'shellfish-free': ['allergen:shellfish'],
  'fish-free': ['allergen:fish'],
  'sesame-free': ['allergen:sesame'],
} as const satisfies Record<DietaryTag, readonly string[]>;

export function dietaryRuleIdsForTag(tag: DietaryTag): readonly string[] {
  return DIETARY_TAG_RULES[tag];
}

export function legacyDietaryRuleIdForTag(tag: DietaryTag): string | null {
  return (
    Object.entries(LEGACY_DERIVED_RULES).find(([, projectedTag]) => projectedTag === tag)?.[0] ??
    null
  );
}

/**
 * Select the effective result without allowing a weaker source to erase a
 * deterministic conflict. Author confirmation may resolve deterministic
 * uncertainty, but it never replaces a conflict.
 */
export function selectEffectiveDietaryAssessment<T extends DietaryAssessmentProjectionInput>(
  assessments: readonly T[],
): T | null {
  const active = assessments.filter((assessment) => assessment.invalidatedAt == null);
  return (
    active.find(
      (assessment) => assessment.source === 'deterministic' && assessment.verdict === 'conflicts',
    ) ??
    active.find((assessment) => assessment.verdict === 'conflicts') ??
    active.find((assessment) => assessment.source === 'author-confirmed') ??
    active.find((assessment) => assessment.source === 'deterministic') ??
    active.find((assessment) => assessment.source === 'on-device') ??
    null
  );
}

/**
 * Compatibility projection for the legacy `recipes.dietary_tags` column.
 *
 * Only complete, current, canonical deterministic assessments can project a
 * positive "-free" tag. Personal/profile results and author declarations use
 * their own storage and can never leak into this shared recipe projection.
 */
export function projectLegacyDietaryTags(
  assessments: readonly DietaryAssessmentProjectionInput[],
): DietaryTag[] {
  const byRule = new Map<string, DietaryAssessmentProjectionInput[]>();
  for (const assessment of assessments) {
    if (
      assessment.ruleId == null ||
      assessment.customRestrictionId != null ||
      assessment.scope !== 'canonical' ||
      assessment.invalidatedAt != null
    ) {
      continue;
    }
    const rows = byRule.get(assessment.ruleId) ?? [];
    rows.push(assessment);
    byRule.set(assessment.ruleId, rows);
  }

  const tags: DietaryTag[] = [];
  for (const [ruleId, tag] of Object.entries(LEGACY_DERIVED_RULES)) {
    const rows = byRule.get(ruleId) ?? [];
    const hasConflict = rows.some((assessment) => assessment.verdict === 'conflicts');
    const hasCompleteDeterministicResult = rows.some(
      (assessment) =>
        assessment.source === 'deterministic' &&
        assessment.verdict === 'meets' &&
        assessment.confidence === 'high',
    );
    if (!hasConflict && hasCompleteDeterministicResult) {
      tags.push(tag);
    }
  }
  return tags;
}
