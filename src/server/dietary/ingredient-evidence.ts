import 'server-only';

import {
  dietaryEvidenceFindingSchema,
  dietaryEvidenceSourceSchema,
  type DietaryEvidenceFinding,
  type DietaryEvidenceSource,
} from '~/lib/dietary-assessment';
import { listDietaryAssessmentsForViewer } from './assessments';

export type IngredientDietaryEvidenceView = {
  ingredientId: string;
  ruleId: string;
  finding: DietaryEvidenceFinding;
  source: DietaryEvidenceSource;
};

type AssessmentWithEvidence = {
  ruleId: string | null;
  customRestrictionId: string | null;
  scope: string;
  source: string;
  verdict: string;
  confidence: string | null;
  invalidatedAt: Date | null;
  evidence: Array<{
    ingredientId: string;
    finding: string;
    source: string;
  }>;
};

function selectEffectiveAssessment(
  rows: readonly AssessmentWithEvidence[],
): AssessmentWithEvidence | null {
  const active = rows.filter((row) => row.invalidatedAt == null);
  return (
    active.find((row) => row.source === 'deterministic' && row.verdict === 'conflicts') ??
    active.find((row) => row.verdict === 'conflicts') ??
    active.find((row) => row.source === 'author-confirmed') ??
    active.find((row) => row.source === 'deterministic') ??
    active.find((row) => row.source === 'on-device') ??
    null
  );
}

/**
 * Flatten effective ingredient evidence. A recipe-local correction supersedes
 * inferred evidence for the same ingredient/rule. Persisted `absent`
 * corrections remain visible so an authorized editor can revise them.
 */
export function projectIngredientDietaryEvidence(
  assessments: readonly AssessmentWithEvidence[],
): IngredientDietaryEvidenceView[] {
  const byRule = new Map<string, AssessmentWithEvidence[]>();
  for (const assessment of assessments) {
    if (assessment.scope !== 'canonical' || !assessment.ruleId) continue;
    const rows = byRule.get(assessment.ruleId) ?? [];
    rows.push(assessment);
    byRule.set(assessment.ruleId, rows);
  }

  const projected: IngredientDietaryEvidenceView[] = [];
  for (const [ruleId, rows] of byRule) {
    const effective = selectEffectiveAssessment(rows);
    if (!effective) continue;

    const evidenceByIngredient = new Map<string, typeof effective.evidence>();
    for (const evidence of effective.evidence) {
      const entries = evidenceByIngredient.get(evidence.ingredientId) ?? [];
      entries.push(evidence);
      evidenceByIngredient.set(evidence.ingredientId, entries);
    }

    for (const [ingredientId, evidence] of evidenceByIngredient) {
      const corrections = evidence.filter((entry) => entry.source === 'ingredient-correction');
      const active = corrections.length > 0 ? corrections : evidence;
      for (const entry of active) {
        const finding = dietaryEvidenceFindingSchema.parse(entry.finding);
        if (finding === 'absent' && entry.source !== 'ingredient-correction') continue;
        projected.push({
          ingredientId,
          ruleId,
          finding,
          source: dietaryEvidenceSourceSchema.parse(entry.source),
        });
      }
    }
  }

  return projected.filter(
    (entry, index, entries) =>
      entries.findIndex(
        (candidate) =>
          candidate.ingredientId === entry.ingredientId &&
          candidate.ruleId === entry.ruleId &&
          candidate.finding === entry.finding &&
          candidate.source === entry.source,
      ) === index,
  );
}

/**
 * Ingredient identifiers are private evidence, so this viewer-scoped selector
 * is intentionally available only to signed-in viewers already authorized by
 * the assessment data-access layer.
 */
export async function listIngredientDietaryEvidenceForViewer(
  recipeId: string,
  actorId: string,
): Promise<IngredientDietaryEvidenceView[]> {
  const assessments = await listDietaryAssessmentsForViewer(recipeId, actorId);
  return projectIngredientDietaryEvidence(assessments);
}
