/**
 * Derive a recipe's structured dietary tags from its ingredient list (issue
 * #273). This is the *derived* half of the hybrid dietary source: it auto-tags
 * only the three "-free" diets the allergen knowledge base can reliably detect
 * from ingredient text — `dairy-free`, `gluten-free`, `egg-free`. The
 * self-declared `vegan`/`vegetarian` tags are deliberately NOT derived here,
 * because the KB can't detect meat (a steak recipe would be falsely tagged
 * vegan); those come only from the author's `dietaryFlags` (#404).
 *
 * Pure and dependency-light (reuses the allergen detector + the diet→allergen
 * map), so it runs on the write path, in a backfill script, and in unit tests.
 */

import { summarizeAllergensForSafety } from "./allergens";
import { DIET_FORBIDDEN_ALLERGENS } from "./dietary-match";
import { type DietaryTag } from "./substitutions";

/**
 * The dietary tags we auto-derive from ingredients, in canonical display order.
 * Only the "-free" tags whose forbidden allergens the KB can detect — never
 * `vegan`/`vegetarian`, which require author declaration.
 */
export const DERIVED_DIETARY_TAGS = [
  "dairy-free",
  "gluten-free",
  "egg-free",
] as const satisfies readonly DietaryTag[];

/**
 * Compute the derived "-free" dietary tags for a recipe from its ingredient
 * `item` strings. A recipe earns a tag iff *none* of its ingredients carry any
 * allergen that diet forbids, using the conservative direct+hidden allergen
 * union (so a hidden source like wheat brewed into soy sauce correctly
 * disqualifies `gluten-free`).
 *
 * Returns the tags in canonical order. An empty ingredient list yields `[]`:
 * we won't assert a recipe is "-free" when there's nothing to analyze (mirrors
 * the fail-closed "safe for" philosophy). Declared flags still apply at query
 * time via the search union.
 */
export function deriveDietaryTags(items: readonly string[]): DietaryTag[] {
  if (items.length === 0) return [];
  const present = new Set(summarizeAllergensForSafety([...items]));
  return DERIVED_DIETARY_TAGS.filter(
    (tag) => !DIET_FORBIDDEN_ALLERGENS[tag].some((a) => present.has(a)),
  );
}
