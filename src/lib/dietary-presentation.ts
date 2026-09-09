import type { Allergen } from './allergens';
import type {
  CustomRestrictionSeverity,
  DietaryAssessmentScope,
  DietaryAssessmentSource,
  DietaryConfidence,
  DietaryVerdict,
} from './dietary-contracts';
import { dietaryRuleIdsForTag } from './dietary-projection';
import type { DietaryTag } from './substitutions';

export type DietaryAttentionView = {
  ingredientId: string;
  name: string;
  kind: 'conflict' | 'unresolved';
};

export type DietaryAssessmentView = {
  ruleId: string;
  scope?: DietaryAssessmentScope;
  profileId?: string | null;
  source: DietaryAssessmentSource;
  verdict: DietaryVerdict;
  confidence: DietaryConfidence | null;
  recognizedIngredients: number;
  totalIngredients: number;
  attentionIngredients: DietaryAttentionView[];
};

export type CustomRestrictionView = {
  id: string;
  name: string;
  severity: CustomRestrictionSeverity;
  terms: string[];
};

export type DietaryProfileView = {
  id: string;
  name: string;
  allergens: Allergen[];
  diets: DietaryTag[];
  customRestrictions: CustomRestrictionView[];
};

export type CardDietaryData = {
  assessments: DietaryAssessmentView[];
  ingredients: { id: string; name: string }[];
};

export type CardDietarySummary = {
  status: 'suitability' | 'conflict' | 'review';
  confidence: DietaryConfidence;
  provenance: 'author-confirmed' | 'ingredient-analyzed';
  recognizedIngredients: number;
  totalIngredients: number;
  attentionIngredients: DietaryAttentionView[];
  detailsCount: number;
  preferenceMatches: number;
};

function normalizedWords(value: string): string {
  return ` ${value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
}

export function ingredientMatchesExactTerm(ingredient: string, term: string): boolean {
  const normalizedTerm = normalizedWords(term).trim();
  return normalizedTerm.length > 0 && normalizedWords(ingredient).includes(` ${normalizedTerm} `);
}

export function profileBuiltInRuleIds(profile: DietaryProfileView): string[] {
  return [
    ...profile.allergens.map((allergen) => `allergen:${allergen}`),
    ...profile.diets.flatMap(dietaryRuleIdsForTag),
  ].filter((ruleId, index, values) => values.indexOf(ruleId) === index);
}

function outcomeRank(assessment: DietaryAssessmentView): number {
  if (assessment.verdict === 'conflicts') return 0;
  if (assessment.source === 'author-confirmed') return 1;
  if (assessment.verdict === 'unknown') return 2;
  if (assessment.confidence === 'medium') return 3;
  return 4;
}

function effectiveByRule(assessments: readonly DietaryAssessmentView[]) {
  const grouped = new Map<string, DietaryAssessmentView[]>();
  for (const assessment of assessments) {
    const rows = grouped.get(assessment.ruleId) ?? [];
    rows.push(assessment);
    grouped.set(assessment.ruleId, rows);
  }
  return new Map(
    [...grouped].map(([ruleId, rows]) => [
      ruleId,
      [...rows].sort((a, b) => outcomeRank(a) - outcomeRank(b))[0]!,
    ]),
  );
}

/**
 * Build the one compact card result for the active profile.
 *
 * Allergens fail closed: anything except a complete high/confirmed match is a
 * review state. Exact custom restrictions only match the literal normalized
 * phrase the profile owner entered; broader aliases remain a separate Family
 * capability.
 */
export function summarizeCardDietaryProfile(
  profile: DietaryProfileView,
  data: CardDietaryData,
): CardDietarySummary | null {
  const requiredRuleIds = profileBuiltInRuleIds(profile);
  const exactMatches = profile.customRestrictions.flatMap((restriction) => {
    const ingredients = data.ingredients.filter((ingredient) =>
      restriction.terms.some((term) => ingredientMatchesExactTerm(ingredient.name, term)),
    );
    return ingredients.length > 0 ? [{ restriction, ingredients }] : [];
  });
  if (requiredRuleIds.length === 0 && profile.customRestrictions.length === 0) return null;

  const byRule = effectiveByRule(data.assessments);
  const required = requiredRuleIds.map((ruleId) => byRule.get(ruleId)).filter(Boolean);
  const missingRule = required.length !== requiredRuleIds.length;
  const builtInConflict = required.some((assessment) => assessment!.verdict === 'conflicts');
  const builtInReview =
    missingRule ||
    required.some(
      (assessment) =>
        assessment!.verdict !== 'meets' ||
        (assessment!.source !== 'author-confirmed' && assessment!.confidence !== 'high'),
    );
  const blockingCustom = exactMatches.filter(
    ({ restriction }) => restriction.severity !== 'preference',
  );
  const blockingCustomRestrictions = profile.customRestrictions.filter(
    (restriction) => restriction.severity !== 'preference',
  );
  const customReview =
    blockingCustomRestrictions.length > 0 &&
    (data.ingredients.length === 0 ||
      blockingCustomRestrictions.some((restriction) => restriction.terms.length === 0));
  const preferenceMatches = exactMatches.length - blockingCustom.length;

  const status: CardDietarySummary['status'] =
    builtInConflict || blockingCustom.length > 0
      ? 'conflict'
      : builtInReview || customReview
        ? 'review'
        : 'suitability';
  const totalIngredients = data.ingredients.length;
  const recognizedIngredients =
    required.length === 0
      ? totalIngredients
      : Math.min(...required.map((assessment) => assessment!.recognizedIngredients));
  const attention = new Map<string, DietaryAttentionView>();
  for (const assessment of required) {
    for (const ingredient of assessment!.attentionIngredients) {
      const existing = attention.get(ingredient.ingredientId);
      if (!existing || ingredient.kind === 'conflict') {
        attention.set(ingredient.ingredientId, ingredient);
      }
    }
  }
  for (const { ingredients } of blockingCustom) {
    for (const ingredient of ingredients) {
      attention.set(ingredient.id, {
        ingredientId: ingredient.id,
        name: ingredient.name,
        kind: 'conflict',
      });
    }
  }

  const allConfirmed =
    required.length > 0 &&
    required.every((assessment) => assessment!.source === 'author-confirmed');
  return {
    status,
    confidence: status === 'review' ? 'needs-review' : 'high',
    provenance: allConfirmed ? 'author-confirmed' : 'ingredient-analyzed',
    recognizedIngredients,
    totalIngredients,
    attentionIngredients: [...attention.values()],
    detailsCount: requiredRuleIds.length + profile.customRestrictions.length,
    preferenceMatches,
  };
}
