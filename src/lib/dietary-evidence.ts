import { detectAllergensForSafety } from './allergens';
import {
  dietaryIngredientEvidenceSchema,
  dietaryIngredientInputSchema,
  type AlgorithmicDietaryAssessment,
  type DietaryEvidenceFinding,
  type DietaryIngredientEvidence,
  type DietaryIngredientInput,
} from './dietary-assessment';
import { canonicalFood, normalizeFoodText } from './food-db';
import {
  COMPOSITION_COVERED_CATEGORIES,
  COMPOSITION_FOOD_OVERRIDES,
  getBuiltInDietaryRule,
  type BuiltInDietaryRule,
  type BuiltInDietaryRuleId,
  type CompositionRuleId,
} from './dietary-rules';

const COVERED_COMPOSITION_CATEGORY_SET = new Set<string>(COMPOSITION_COVERED_CATEGORIES);
const DEFINITE_DETERMINISTIC_SOURCES = new Set([
  'food-link',
  'text-match',
  'ingredient-correction',
  'certification',
]);

function includesPhrase(item: string, phrase: string): boolean {
  const normalizedItem = ` ${normalizeFoodText(item)} `;
  const normalizedPhrase = normalizeFoodText(phrase);
  return normalizedPhrase.length > 0 && normalizedItem.includes(` ${normalizedPhrase} `);
}

function evidence(
  ingredient: DietaryIngredientInput,
  ruleId: BuiltInDietaryRuleId,
  finding: DietaryEvidenceFinding,
  source: 'food-link' | 'text-match',
): DietaryIngredientEvidence {
  return {
    ingredientId: ingredient.ingredientId,
    ruleId,
    finding,
    source,
    material: true,
    foodId: source === 'food-link' ? (ingredient.linkedFood?.id ?? null) : null,
    correctionId: null,
  };
}

function allergenEvidence(
  ingredient: DietaryIngredientInput,
  rule: Extract<BuiltInDietaryRule, { kind: 'allergen' }>,
): DietaryIngredientEvidence[] {
  const findings: DietaryIngredientEvidence[] = [];
  const linkedAllergens = ingredient.linkedFood?.allergens;
  if (linkedAllergens != null) {
    findings.push(
      evidence(
        ingredient,
        rule.id,
        linkedAllergens.includes(rule.allergen) ? 'present' : 'absent',
        'food-link',
      ),
    );
  }

  if (detectAllergensForSafety(ingredient.item).includes(rule.allergen)) {
    findings.push(evidence(ingredient, rule.id, 'present', 'text-match'));
  }
  if (rule.absenceAliases.some((alias) => includesPhrase(ingredient.item, alias))) {
    findings.push(evidence(ingredient, rule.id, 'absent', 'text-match'));
  }

  return findings.length > 0
    ? findings
    : [evidence(ingredient, rule.id, 'unresolved', 'text-match')];
}

function compositionFinding(
  rule: Extract<BuiltInDietaryRule, { kind: 'composition' }>,
  slug: string,
  category: string,
  allergens: readonly string[] | null,
): DietaryEvidenceFinding | null {
  const override = COMPOSITION_FOOD_OVERRIDES[slug]?.[rule.id as CompositionRuleId];
  if (override) return override;
  if (allergens?.some((allergen) => rule.forbiddenAllergens.includes(allergen as never))) {
    return 'present';
  }
  if (rule.forbiddenCategories.includes(category as never)) return 'present';
  if (COVERED_COMPOSITION_CATEGORY_SET.has(category)) return 'absent';
  return null;
}

function compositionEvidence(
  ingredient: DietaryIngredientInput,
  rule: Extract<BuiltInDietaryRule, { kind: 'composition' }>,
): DietaryIngredientEvidence[] {
  const findings: DietaryIngredientEvidence[] = [];
  const linked = ingredient.linkedFood;
  if (linked) {
    const finding = compositionFinding(rule, linked.slug, linked.category, linked.allergens);
    if (finding) findings.push(evidence(ingredient, rule.id, finding, 'food-link'));
  } else {
    const canonical = canonicalFood(ingredient.item);
    if (canonical) {
      const finding = compositionFinding(rule, canonical.slug, canonical.category, null);
      if (finding) findings.push(evidence(ingredient, rule.id, finding, 'text-match'));
    }
  }

  const textAllergens = detectAllergensForSafety(ingredient.item);
  if (textAllergens.some((allergen) => rule.forbiddenAllergens.includes(allergen))) {
    findings.push(evidence(ingredient, rule.id, 'present', 'text-match'));
  }
  if (rule.positiveAliases.some((alias) => includesPhrase(ingredient.item, alias))) {
    findings.push(evidence(ingredient, rule.id, 'absent', 'text-match'));
  }

  return findings.length > 0
    ? findings
    : [evidence(ingredient, rule.id, 'unresolved', 'text-match')];
}

/**
 * Produce deterministic evidence from existing curated text and food-graph
 * facts. Confirmation-only rules intentionally never infer a positive result.
 */
export function deterministicEvidenceForIngredient(
  ingredientValue: DietaryIngredientInput,
  ruleId: BuiltInDietaryRuleId,
): DietaryIngredientEvidence[] {
  const ingredient = dietaryIngredientInputSchema.parse(ingredientValue);
  const rule = getBuiltInDietaryRule(ruleId);
  if (!rule) throw new RangeError(`Unknown built-in dietary rule: ${ruleId}`);
  if (rule.kind === 'allergen') return allergenEvidence(ingredient, rule);
  if (rule.kind === 'composition') return compositionEvidence(ingredient, rule);
  return [evidence(ingredient, rule.id, 'unresolved', 'text-match')];
}

export type AggregatedDietaryAssessment = AlgorithmicDietaryAssessment & {
  ingredientCount: number;
  coveredIngredientCount: number;
  attentionIngredientIds: string[];
  evidence: DietaryIngredientEvidence[];
};

/**
 * Aggregate ingredient evidence as a veto-based constraint.
 *
 * A definite `present` finding wins before ambiguity and confirmations are
 * considered. Missing evidence is synthesized as material unresolved evidence,
 * so unmatched text can never become evidence of absence.
 */
export function aggregateDietaryEvidence(input: {
  ruleId: string;
  ingredientIds: readonly string[];
  evidence: readonly DietaryIngredientEvidence[];
}): AggregatedDietaryAssessment {
  const ingredientIds = [...new Set(input.ingredientIds)];
  if (ingredientIds.length !== input.ingredientIds.length) {
    throw new RangeError('Ingredient ids must be unique when aggregating evidence');
  }
  const knownIngredients = new Set(ingredientIds);
  const relevantByKey = new Map<string, DietaryIngredientEvidence>();
  for (const value of input.evidence) {
    const item = dietaryIngredientEvidenceSchema.parse(value);
    if (item.ruleId !== input.ruleId) continue;
    if (!knownIngredients.has(item.ingredientId)) {
      throw new RangeError(`Evidence references unknown ingredient: ${item.ingredientId}`);
    }
    const key = `${item.ingredientId}\u0000${item.source}\u0000${item.finding}`;
    if (!relevantByKey.has(key)) relevantByKey.set(key, item);
  }
  const relevant = [...relevantByKey.values()];

  const byIngredient = new Map<string, DietaryIngredientEvidence[]>();
  for (const ingredientId of ingredientIds) byIngredient.set(ingredientId, []);
  for (const item of relevant) byIngredient.get(item.ingredientId)!.push(item);

  const attention = new Set<string>();
  let coveredIngredientCount = 0;
  let hasDefiniteConflict = false;
  let hasMaterialAmbiguity = ingredientIds.length === 0;
  let hasLimitedAmbiguity = false;

  for (const [ingredientId, findings] of byIngredient) {
    const corrections = findings.filter((item) => item.source === 'ingredient-correction');
    const effectiveFindings = corrections.length > 0 ? corrections : findings;
    const present = effectiveFindings.filter((item) => item.finding === 'present');
    if (present.length > 0) {
      coveredIngredientCount++;
      attention.add(ingredientId);
      const hasDeterministicConflict = present.some((item) =>
        DEFINITE_DETERMINISTIC_SOURCES.has(item.source),
      );
      const isContradicted = effectiveFindings.some((item) => item.finding === 'absent');
      if (hasDeterministicConflict || !isContradicted) {
        hasDefiniteConflict = true;
      } else {
        hasMaterialAmbiguity = true;
      }
      continue;
    }

    const ambiguities = effectiveFindings.filter(
      (item) => item.finding === 'possible' || item.finding === 'unresolved',
    );
    const reviewedAbsence = effectiveFindings.some(
      (item) =>
        item.finding === 'absent' &&
        (item.source === 'ingredient-correction' ||
          item.source === 'author-confirmed' ||
          item.source === 'certification'),
    );
    if (!reviewedAbsence && ambiguities.some((item) => item.material)) {
      hasMaterialAmbiguity = true;
      attention.add(ingredientId);
      continue;
    }
    if (!reviewedAbsence && ambiguities.length > 0) {
      hasLimitedAmbiguity = true;
      attention.add(ingredientId);
    }

    if (effectiveFindings.some((item) => item.finding === 'absent')) {
      coveredIngredientCount++;
    } else if (ambiguities.length === 0) {
      hasMaterialAmbiguity = true;
      attention.add(ingredientId);
    }
  }

  const outcome: AlgorithmicDietaryAssessment = hasDefiniteConflict
    ? { verdict: 'conflicts', confidence: 'high' }
    : hasMaterialAmbiguity
      ? { verdict: 'unknown', confidence: 'needs-review' }
      : hasLimitedAmbiguity
        ? { verdict: 'meets', confidence: 'medium' }
        : { verdict: 'meets', confidence: 'high' };

  return {
    ...outcome,
    ingredientCount: ingredientIds.length,
    coveredIngredientCount,
    attentionIngredientIds: [...attention],
    evidence: [...relevant],
  };
}

/** Evaluate and aggregate one built-in rule over a complete ingredient list. */
export function assessIngredientsDeterministically(
  ingredients: readonly DietaryIngredientInput[],
  ruleId: BuiltInDietaryRuleId,
): AggregatedDietaryAssessment {
  return aggregateDietaryEvidence({
    ruleId,
    ingredientIds: ingredients.map((ingredient) => ingredient.ingredientId),
    evidence: ingredients.flatMap((ingredient) =>
      deterministicEvidenceForIngredient(ingredient, ruleId),
    ),
  });
}
