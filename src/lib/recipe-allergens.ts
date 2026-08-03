/**
 * Structured recipe-allergen computation (pure core). Given a recipe's
 * ingredient lines, each optionally carrying the canonical allergen tokens from
 * its resolved `food_items` node, this rolls them up into the allergens to weigh
 * for a personalized safety check.
 *
 * The food graph is the source of truth: when an ingredient line resolves to a
 * food with curated allergens, those are used verbatim. Only lines that DON'T
 * resolve (no `foodId`, or a food without curated allergen data) fall back to
 * the best-effort free-text detector in `src/lib/allergens.ts`. Keeping this
 * pure (the DB join lives in `src/server/recipes/allergens.ts`) makes the
 * union/fallback logic exhaustively unit-testable without a database.
 */
import {
  ALLERGENS,
  detectAllergensForSafety,
  isAllergen,
  type Allergen,
} from "./allergens";

const ALLERGEN_ORDER = new Map<Allergen, number>(
  ALLERGENS.map((a, i) => [a, i]),
);

function sortAllergens(list: Allergen[]): Allergen[] {
  return [...new Set(list)].sort(
    (a, b) => (ALLERGEN_ORDER.get(a) ?? 99) - (ALLERGEN_ORDER.get(b) ?? 99),
  );
}

/** One ingredient line's allergen inputs. */
export type AllergenIngredientSource = {
  /** The free-text ingredient string (the text-detector fallback). */
  item: string;
  /**
   * Canonical allergen tokens from the resolved `food_items.allergens`, or
   * `null` when the line didn't resolve to a food carrying curated allergens.
   * An empty array is meaningful ("resolved, carries none") and suppresses the
   * text fallback for that line.
   */
  foodAllergens: readonly string[] | null;
};

/**
 * The safety allergens a single ingredient line carries: the structured
 * food-graph tokens when present, else the best-effort text detection. Returned
 * de-duplicated and in canonical order.
 */
export function ingredientAllergens(src: AllergenIngredientSource): Allergen[] {
  if (src.foodAllergens != null) {
    return sortAllergens(src.foodAllergens.filter(isAllergen));
  }
  return detectAllergensForSafety(src.item);
}

/**
 * Roll a whole recipe's ingredient lines up to the de-duplicated, canonically
 * sorted union of every line's allergens (structured where known, text where
 * not). An empty ingredient list yields `[]`.
 */
export function unionIngredientAllergens(
  srcs: readonly AllergenIngredientSource[],
): Allergen[] {
  return sortAllergens(srcs.flatMap((src) => ingredientAllergens(src)));
}
