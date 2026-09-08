import type {
  DietaryAssessmentScope,
  DietaryAssessmentSource,
  DietaryConfidence,
  DietaryVerdict,
} from './dietary-assessment';
import { selectEffectiveDietaryAssessment } from './dietary-projection';

export type DietaryAssessmentEvidenceView = {
  ingredientId: string;
  ingredient: string;
  finding: 'present' | 'absent' | 'possible' | 'unresolved';
};

export type DietaryAssessmentView = {
  ruleId: string;
  scope: DietaryAssessmentScope;
  profileId: string | null;
  source: DietaryAssessmentSource;
  verdict: DietaryVerdict;
  confidence: DietaryConfidence | null;
  recognizedIngredients: number;
  totalIngredients: number;
  evidence: DietaryAssessmentEvidenceView[];
};

export function effectiveDietaryAssessmentViews(
  assessments: readonly DietaryAssessmentView[],
): DietaryAssessmentView[] {
  const byTarget = new Map<string, DietaryAssessmentView[]>();
  for (const assessment of assessments) {
    const key = `${assessment.scope}:${assessment.profileId ?? ''}:${assessment.ruleId}`;
    const rows = byTarget.get(key) ?? [];
    rows.push(assessment);
    byTarget.set(key, rows);
  }
  return [...byTarget.values()].flatMap((rows) => {
    const effective = selectEffectiveDietaryAssessment(
      rows.map((row) => ({ ...row, customRestrictionId: null, invalidatedAt: null })),
    );
    return effective ? [effective] : [];
  });
}

export function dietaryAssessmentStatus(
  assessment: Pick<DietaryAssessmentView, 'verdict' | 'confidence'>,
): 'suitability' | 'conflict' | 'review' {
  if (assessment.verdict === 'conflicts') return 'conflict';
  if (assessment.verdict === 'meets' && assessment.confidence !== 'needs-review') {
    return 'suitability';
  }
  return 'review';
}

export function isDefiniteDietaryMatch(
  assessment: Pick<DietaryAssessmentView, 'source' | 'verdict' | 'confidence'>,
): boolean {
  return (
    assessment.verdict === 'meets' &&
    (assessment.source === 'author-confirmed' || assessment.confidence === 'high')
  );
}

export function isPossibleDietaryMatch(
  assessment: Pick<DietaryAssessmentView, 'verdict' | 'confidence'>,
): boolean {
  return assessment.verdict === 'meets' && assessment.confidence === 'medium';
}
