import { ALLERGEN_RULES, ALLERGENS, type Allergen } from './allergens';
import { FOOD_ALLERGENS } from './food-allergens';
import { FOOD_ITEMS, foodSlug, stableHash, type FoodCategory } from './food-db';
import type { DietaryRuleKind } from './dietary-assessment';

type AllergenDietaryRule = {
  id: `allergen:${Allergen}`;
  kind: 'allergen';
  allergen: Allergen;
  absenceAliases: readonly string[];
};

export type CompositionRuleId =
  'composition:vegan' | 'composition:vegetarian' | 'composition:pescatarian';

type CompositionDietaryRule = {
  id: CompositionRuleId;
  kind: 'composition';
  forbiddenAllergens: readonly Allergen[];
  forbiddenCategories: readonly FoodCategory[];
  positiveAliases: readonly string[];
};

export type ConfirmationOnlyRuleId =
  'confirmation:celiac-safe' | 'confirmation:kosher' | 'confirmation:halal';

type ConfirmationOnlyDietaryRule = {
  id: ConfirmationOnlyRuleId;
  kind: 'confirmation-only';
  requiredSource: 'author-confirmed-or-certification';
};

export type BuiltInDietaryRule =
  AllergenDietaryRule | CompositionDietaryRule | ConfirmationOnlyDietaryRule;
export type BuiltInDietaryRuleId = BuiltInDietaryRule['id'];

const ALLERGEN_ABSENCE_ALIASES: Record<Allergen, readonly string[]> = {
  peanut: ['peanut free', 'peanut-free'],
  'tree-nut': ['tree nut free', 'tree-nut-free', 'nut free', 'nut-free'],
  dairy: ['dairy free', 'dairy-free', 'milk free', 'milk-free', 'vegan'],
  egg: ['egg free', 'egg-free', 'vegan'],
  soy: ['soy free', 'soy-free'],
  wheat: ['wheat free', 'wheat-free', 'gluten free', 'gluten-free'],
  fish: ['fish free', 'fish-free', 'vegan', 'vegetarian'],
  shellfish: ['shellfish free', 'shellfish-free', 'vegan', 'vegetarian'],
  sesame: ['sesame free', 'sesame-free'],
};

const COMPOSITION_RULES = [
  {
    id: 'composition:vegan',
    kind: 'composition',
    forbiddenAllergens: ['dairy', 'egg', 'fish', 'shellfish'],
    forbiddenCategories: ['dairy', 'egg', 'meat', 'seafood'],
    positiveAliases: ['vegan', 'plant based', 'plant-based'],
  },
  {
    id: 'composition:vegetarian',
    kind: 'composition',
    forbiddenAllergens: ['fish', 'shellfish'],
    forbiddenCategories: ['meat', 'seafood'],
    positiveAliases: ['vegan', 'vegetarian', 'plant based', 'plant-based'],
  },
  {
    id: 'composition:pescatarian',
    kind: 'composition',
    forbiddenAllergens: [],
    forbiddenCategories: ['meat'],
    positiveAliases: ['vegan', 'vegetarian', 'pescatarian', 'plant based', 'plant-based'],
  },
] as const satisfies readonly CompositionDietaryRule[];

const CONFIRMATION_ONLY_RULES = [
  {
    id: 'confirmation:celiac-safe',
    kind: 'confirmation-only',
    requiredSource: 'author-confirmed-or-certification',
  },
  {
    id: 'confirmation:kosher',
    kind: 'confirmation-only',
    requiredSource: 'author-confirmed-or-certification',
  },
  {
    id: 'confirmation:halal',
    kind: 'confirmation-only',
    requiredSource: 'author-confirmed-or-certification',
  },
] as const satisfies readonly ConfirmationOnlyDietaryRule[];

const ALLERGEN_DIETARY_RULES = ALLERGENS.map((allergen): AllergenDietaryRule => ({
  id: `allergen:${allergen}`,
  kind: 'allergen',
  allergen,
  absenceAliases: ALLERGEN_ABSENCE_ALIASES[allergen],
}));

/** Stable, deterministic registry independent of the legacy `DietaryTag` union. */
export const BUILT_IN_DIETARY_RULES = [
  ...ALLERGEN_DIETARY_RULES,
  ...COMPOSITION_RULES,
  ...CONFIRMATION_ONLY_RULES,
] as const satisfies readonly BuiltInDietaryRule[];

const BUILT_IN_RULE_BY_ID = new Map<BuiltInDietaryRuleId, BuiltInDietaryRule>(
  BUILT_IN_DIETARY_RULES.map((rule) => [rule.id, rule]),
);

export function getBuiltInDietaryRule(id: string): BuiltInDietaryRule | undefined {
  return BUILT_IN_RULE_BY_ID.get(id as BuiltInDietaryRuleId);
}

export function isBuiltInDietaryRuleId(value: string): value is BuiltInDietaryRuleId {
  return BUILT_IN_RULE_BY_ID.has(value as BuiltInDietaryRuleId);
}

export const DIETARY_ALGORITHM_VERSION = 1;

/**
 * Categories whose canonical nodes establish composition coverage. Broad
 * compound categories remain unresolved rather than being assumed suitable.
 */
export const COMPOSITION_COVERED_CATEGORIES = [
  'dairy',
  'baking',
  'grain',
  'legume',
  'produce-whole',
  'produce-leafy',
  'produce-fruit',
  'herb',
  'spice',
  'meat',
  'seafood',
  'egg',
  'nut-seed',
] as const satisfies readonly FoodCategory[];

/**
 * A category is usually enough for composition, but these foods need a more
 * specific fact. Honey is not vegan despite sharing the broad sweetener
 * category with plant sugars.
 */
export const COMPOSITION_FOOD_OVERRIDES: Readonly<
  Record<string, Partial<Record<CompositionRuleId, 'present' | 'absent'>>>
> = {
  honey: {
    'composition:vegan': 'present',
    'composition:vegetarian': 'absent',
    'composition:pescatarian': 'absent',
  },
};

function clean(value: string): string {
  return value.replace(/[,|\n]/g, ' ');
}

function serializeList(values: readonly string[]): string {
  return [...values].map(clean).sort().join('/');
}

/**
 * Canonical serialization of every curated input used by dietary resolution.
 * Reordering source arrays alone cannot change the digest.
 */
export function dietaryRulesetInputsFingerprint(): string {
  const registry = BUILT_IN_DIETARY_RULES.map((rule) => {
    if (rule.kind === 'allergen') {
      return `${rule.id}|${serializeList(rule.absenceAliases)}`;
    }
    if (rule.kind === 'composition') {
      return [
        rule.id,
        serializeList(rule.forbiddenAllergens),
        serializeList(rule.forbiddenCategories),
        serializeList(rule.positiveAliases),
      ].join('|');
    }
    return `${rule.id}|${rule.requiredSource}`;
  })
    .sort()
    .join(',');

  const textRules = ALLERGEN_RULES.map((rule) =>
    [
      serializeList(rule.allergens),
      serializeList(rule.aliases),
      serializeList(rule.unless ?? []),
      rule.hidden ? 'hidden' : 'direct',
    ].join('|'),
  )
    .sort()
    .join(',');

  const foodAllergens = Object.entries(FOOD_ALLERGENS)
    .map(([slug, allergens]) => `${slug}|${serializeList(allergens)}`)
    .sort()
    .join(',');

  const foodGraph = FOOD_ITEMS.map(
    (food) => `${foodSlug(food.name)}|${food.category}|${serializeList(food.aliases)}`,
  )
    .sort()
    .join(',');

  const composition = [
    `categories:${serializeList(COMPOSITION_COVERED_CATEGORIES)}`,
    `overrides:${Object.entries(COMPOSITION_FOOD_OVERRIDES)
      .flatMap(([slug, values]) =>
        Object.entries(values).map(([ruleId, finding]) => `${slug}|${ruleId}|${finding}`),
      )
      .sort()
      .join(',')}`,
  ].join('\n');

  return [
    `registry:${registry}`,
    `allergen-text:${textRules}`,
    `food-allergens:${foodAllergens}`,
    `food-graph:${foodGraph}`,
    composition,
  ].join('\n');
}

let memoizedRulesetVersion: string | undefined;

/** `d<algorithm>.<automatic curated-content hash>`. */
export function dietaryRulesetVersion(): string {
  memoizedRulesetVersion ??= `d${DIETARY_ALGORITHM_VERSION}.${stableHash(dietaryRulesetInputsFingerprint())}`;
  return memoizedRulesetVersion;
}

export function dietaryRuleKind(id: BuiltInDietaryRuleId): DietaryRuleKind {
  return BUILT_IN_RULE_BY_ID.get(id)!.kind;
}
