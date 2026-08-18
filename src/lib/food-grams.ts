/**
 * The single ingredient-line → grams path (issue #1025, ADR-0006).
 *
 * Before this module there were two gram converters that disagreed:
 * `recipe-nutrition.ts`'s `resolveLineGrams` (mass, or volume via density) and
 * `food-nutrition.ts`'s `toGrams` (its own private mass/volume tables). Both
 * returned a bare `number | null`, and both returned `null` for the entire
 * `count` dimension, so a dropped line was indistinguishable from a line that
 * weighed nothing.
 *
 * This module replaces both with one resolver that answers a strictly better
 * question. Not "how many grams?" but **"how many grams, and how much should you
 * trust that?"** A caller can then weight, threshold, or explain an estimate
 * instead of silently averaging a scale reading together with a guess.
 *
 * Resolution is ordered most-trustworthy-first:
 *
 * | Confidence | Path                                   | Example                  |
 * | ---------- | -------------------------------------- | ------------------------ |
 * | `exact`    | mass unit, pure arithmetic             | `250 g flour`            |
 * | `portion`  | a curated per-food weight for the unit | `2 eggs`, `1 clove`      |
 * | `density`  | volume × the food's generic `g/mL`     | `1 cup milk`             |
 * | *(null)*   | no path exists                         | `1 splash` of an unknown |
 *
 * A curated portion outranks density deliberately: it is measured for *this*
 * food in *this* unit, whereas a density is one scalar averaged across every
 * volume measure of the food. Mass outranks both because it involves no
 * estimation at all.
 *
 * Pure and framework-free. Never throws; an unresolvable line returns `null`,
 * which callers must treat as "unknown weight", never as zero.
 */
import { convertUnit, unitDimension } from './units';
import { canonicalFood, densityForFood } from './food-db';
import { portionForSlug, type FoodPortion } from './food-portions';

/**
 * How a line's weight was arrived at. Ordered from most to least trustworthy;
 * `none` is reserved for the roll-up layer to describe a line that produced no
 * weight at all (this module returns `null` for that case rather than a
 * zero-gram resolution, so an unweighable line can never be summed by mistake).
 */
export type GramConfidence = 'exact' | 'portion' | 'density' | 'none';

/**
 * Relative trust in each path, used to weight a roll-up's aggregate confidence.
 * These are judgement calls, not measurements: a scale reading is certain, a
 * curated portion is a good generic ("1 medium onion"), and a density applied to
 * a volume is the loosest step that is still worth taking.
 */
export const CONFIDENCE_WEIGHT: Readonly<Record<GramConfidence, number>> = {
  exact: 1,
  portion: 0.8,
  density: 0.6,
  none: 0,
};

/** A resolved line weight and the path that produced it. */
export type GramResolution = {
  /** Weight in grams. Always finite and >= 0. */
  grams: number;
  /** How the weight was derived. Never `none` — an unresolved line is `null`. */
  confidence: Exclude<GramConfidence, 'none'>;
  /** The curated portion used, when `confidence` is `portion`. */
  portion?: FoodPortion;
};

function usableQuantity(quantity: number | null | undefined): number | null {
  if (quantity == null || !Number.isFinite(quantity) || quantity < 0) return null;
  return quantity;
}

/**
 * Resolve a line's weight for a food already identified by its canonical slug.
 * This is the server/graph entry point: the caller has a `foodId` → slug and the
 * food's `densityGPerMl` in hand, so no text matching happens here.
 *
 * `density` is the food's grams per millilitre, or null/undefined when it has
 * none. A non-positive density is treated as absent rather than trusted.
 */
export function resolveGramsForSlug(
  slug: string | null | undefined,
  quantity: number | null | undefined,
  unit: string | null | undefined,
  density: number | null | undefined,
): GramResolution | null {
  const qty = usableQuantity(quantity);
  if (qty == null) return null;

  // 1. Mass. Pure arithmetic, no estimation.
  if (unitDimension(unit) === 'mass') {
    const grams = convertUnit(qty, unit!, 'g');
    if (grams != null) return { grams, confidence: 'exact' };
  }

  // 2. A curated portion for this exact (food, unit). Covers the whole `count`
  //    dimension plus every density-less volume measure.
  const portion = slug ? portionForSlug(slug, unit) : null;
  if (portion) {
    return { grams: qty * portion.gramsPerUnit, confidence: 'portion', portion };
  }

  // 3. Volume via the food's generic density.
  if (unitDimension(unit) === 'volume') {
    const usableDensity =
      density != null && Number.isFinite(density) && density > 0 ? density : null;
    if (usableDensity != null) {
      const ml = convertUnit(qty, unit!, 'ml');
      if (ml != null) return { grams: ml * usableDensity, confidence: 'density' };
    }
  }

  return null;
}

/**
 * Resolve a line's weight from **free text**, matching the ingredient against
 * the curated food knowledge base first. This is the client/offline entry point
 * used where no `foodId` link exists yet.
 *
 * A line whose text matches no food can still resolve when it carries a mass
 * unit, because `500 g` weighs 500 g regardless of what it is.
 */
export function resolveGramsForFood(
  item: string | null | undefined,
  quantity: number | null | undefined,
  unit: string | null | undefined,
): GramResolution | null {
  const food = canonicalFood(item);
  return resolveGramsForSlug(food?.slug ?? null, quantity, unit, densityForFood(item));
}
