/**
 * Curated food → allergen map: the STRUCTURED half of the safety foundation.
 * Where `src/lib/allergens.ts` detects allergens from an ingredient's free text,
 * this attaches canonical {@link Allergen} tokens to the canonical food graph
 * nodes (`food_items`, keyed by their stable {@link foodSlug}). `food_items` is
 * seeded from these (see `seed-ingredients.ts`), and `getRecipeAllergens` reads
 * them as the source of truth — falling back to the text detector only for
 * ingredient lines that don't resolve to a food carrying curated allergens.
 *
 * Design: only foods that carry an *unambiguous* allergen are listed. Nodes
 * whose aliases span several allergen groups (e.g. "Nuts" covers peanut AND
 * tree-nut, "Oil" covers sesame oil AND olive oil, "Peanut butter" also aliases
 * tahini/almond butter) are deliberately omitted so those lines fall back to the
 * per-item text detector rather than being mislabelled by a coarse node token.
 *
 * The `Record<string, Allergen[]>` type makes any drift from the `Allergen`
 * union a compile error; `assertFoodAllergensValid` (exercised by the unit test
 * and the seed) additionally guarantees every key is a real food slug.
 */
import { ALLERGENS, isAllergen, type Allergen } from "./allergens";
import { FOOD_ITEMS, foodSlug } from "./food-db";

/**
 * Curated map from a food's stable slug to the allergens it inherently carries.
 * Keys must match `foodSlug(name)` for a food in {@link FOOD_ITEMS}; values must
 * be canonical {@link Allergen} tokens (enforced by the type + the validator).
 */
export const FOOD_ALLERGENS: Record<string, Allergen[]> = {
  // Dairy
  milk: ["dairy"],
  cream: ["dairy"],
  yogurt: ["dairy"],
  cheese: ["dairy"],
  butter: ["dairy"],
  // Wheat / gluten
  flour: ["wheat"],
  "whole-wheat-flour": ["wheat"],
  pasta: ["wheat"],
  couscous: ["wheat"],
  barley: ["wheat"],
  bulgur: ["wheat"],
  breadcrumbs: ["wheat"],
  // Tree nut
  "almond-flour": ["tree-nut"],
  // Egg
  egg: ["egg"],
  "egg-white": ["egg"],
  "egg-yolk": ["egg"],
  mayonnaise: ["egg"],
  // Fish
  fish: ["fish"],
  "worcestershire-sauce": ["fish"],
  // Shellfish
  shrimp: ["shellfish"],
  scallops: ["shellfish"],
  crab: ["shellfish"],
  mussels: ["shellfish"],
  // Soy (soy sauce is brewed with wheat)
  "soy-sauce": ["soy", "wheat"],
};

const ALLERGEN_ORDER = new Map<Allergen, number>(
  ALLERGENS.map((a, i) => [a, i]),
);

/** The curated allergens for a food slug in canonical order, or `null` when the
 *  slug isn't curated (caller should fall back to text detection). */
export function foodAllergensForSlug(slug: string): Allergen[] | null {
  const list = FOOD_ALLERGENS[slug];
  if (!list) return null;
  return [...new Set(list)].sort(
    (a, b) => (ALLERGEN_ORDER.get(a) ?? 99) - (ALLERGEN_ORDER.get(b) ?? 99),
  );
}

/**
 * Fail-loud invariant check used by the seed and the unit test: every key is a
 * real food slug and every value is a canonical allergen token. Keeps the
 * curated map from drifting away from the food graph or the `Allergen` union.
 */
export function assertFoodAllergensValid(): void {
  const validSlugs = new Set(FOOD_ITEMS.map((food) => foodSlug(food.name)));
  for (const [slug, allergens] of Object.entries(FOOD_ALLERGENS)) {
    if (!validSlugs.has(slug)) {
      throw new Error(
        `FOOD_ALLERGENS key "${slug}" is not a known food slug (see FOOD_ITEMS).`,
      );
    }
    for (const allergen of allergens as readonly string[]) {
      if (!isAllergen(allergen)) {
        throw new Error(
          `FOOD_ALLERGENS["${slug}"] contains "${allergen}", not a canonical Allergen.`,
        );
      }
    }
  }
}
