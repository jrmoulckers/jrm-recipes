import {
  customDietaryRestrictionTermSchema,
  dietaryIngredientInputSchema,
  type DietaryIngredientInput,
} from './dietary-assessment';
import { stableHash } from './food-db';

function canonicalIngredient(input: DietaryIngredientInput): string {
  const food = input.linkedFood;
  return JSON.stringify([
    input.ingredientId,
    input.item,
    input.amount,
    input.amountMax,
    input.unit,
    input.prep,
    food
      ? [
          food.id,
          food.slug,
          food.category,
          food.allergens == null ? null : [...food.allergens].sort(),
        ]
      : null,
  ]);
}

/**
 * Canonical serialization of every ingredient input that can affect dietary
 * resolution. Ingredient order is irrelevant; identity and all resolution
 * fields are not.
 */
export function dietaryIngredientInputsFingerprint(
  input: readonly DietaryIngredientInput[],
): string {
  const ingredients = input.map((item) => dietaryIngredientInputSchema.parse(item));
  const ids = ingredients.map((item) => item.ingredientId);
  if (new Set(ids).size !== ids.length) {
    throw new RangeError('Ingredient ids must be unique when fingerprinting');
  }
  return ingredients.map(canonicalIngredient).sort().join('\n');
}

/** Compact persisted freshness boundary for a recipe's dietary inputs. */
export function dietaryIngredientFingerprint(input: readonly DietaryIngredientInput[]): string {
  return `i1.${stableHash(dietaryIngredientInputsFingerprint(input))}`;
}

/**
 * Freshness boundary for exact terms and suggested aliases on one custom
 * restriction. Approval is part of the input: accepting or withdrawing an
 * alias changes the version even when its text does not.
 */
export function customRestrictionTermsFingerprint(
  input: readonly {
    term: string;
    source: 'exact' | 'suggested';
    approved: boolean;
  }[],
): string {
  const terms = input.map((term) => customDietaryRestrictionTermSchema.parse(term));
  const serialized = terms
    .map((term) => JSON.stringify([term.term, term.source, term.approved]))
    .sort()
    .join('\n');
  return `r1.${stableHash(serialized)}`;
}
