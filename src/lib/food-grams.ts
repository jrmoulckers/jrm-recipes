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

/**
 * Why a line contributed nothing to a nutrition estimate (issue #1027). Kept as
 * a labelled value rather than a bare count so a panel can say *"couldn't weigh:
 * 6 eggs"* instead of showing a bare percentage: a cook told which line is
 * missing can fix it by editing one unit, whereas a cook shown "62%" cannot act
 * at all.
 */
export type UnresolvedLine = {
  /** The ingredient text, for display. */
  label: string;
  /** `weight`: no gram path existed. `facts`: weighable, but no per-100 g data. */
  reason: 'weight' | 'facts';
};

/** One line's input to {@link aggregateConfidence}. */
export type ConfidenceEntry = {
  /** The line's resolved weight, or `null` when it could not be weighed. */
  grams: number | null;
  /** The path that produced the line's *nutrition*, or `none` if it produced none. */
  confidence: GramConfidence;
};

/**
 * Aggregate per-line resolution results into one 0–1 confidence score for a
 * whole recipe (issue #1027), replacing the `massCoverage` ratio that preceded
 * it.
 *
 * `massCoverage` was `accountedGrams / weighableGrams`, and was structurally
 * incapable of seeing its largest error: a line that could not be weighed never
 * entered `weighableGrams`, so it left the **denominator as well as the
 * numerator**. `1 tbsp olive oil + 6 unweighable eggs` scored a confident
 * `1.0` while capturing about 4% of the food.
 *
 * The fix is to keep those lines in the denominator, at confidence weight 0, so
 * that they *lower* the score rather than vanishing from it. Two axes are
 * combined:
 *
 * 1. **Among the lines we could weigh**, a mass-weighted mean of
 *    {@link CONFIDENCE_WEIGHT}. Weighting by grams is what makes the score track
 *    the food rather than the line count: a density-guessed kilo of beef should
 *    move it far more than an exactly-weighed gram of salt.
 * 2. **The lines we could not weigh** dilute that mean by their share of the
 *    line count. They have no mass to be weighted by — that is precisely what
 *    failed — and inventing one would repeat the error being fixed, so each is
 *    held at the average weight of the lines that *did* resolve. (Equivalently:
 *    multiply by `weighed / total`.) The average is used only to apportion
 *    confidence; no line is ever treated as having that many grams.
 *
 * A line that weighed fine but had no curated facts contributes 0 nutrition, so
 * it enters with `confidence: 'none'` and drags the mass-weighted term down —
 * the honesty `massCoverage` did provide, preserved.
 *
 * Returns 0 for an empty list or when nothing could be weighed. Pure; never
 * throws.
 */
export function aggregateConfidence(entries: readonly ConfidenceEntry[]): number {
  if (entries.length === 0) return 0;

  let mass = 0;
  let weightedMass = 0;
  let weighed = 0;
  let weightSum = 0;

  for (const entry of entries) {
    const grams = entry.grams;
    if (grams == null || !Number.isFinite(grams) || grams < 0) continue;
    const weight = CONFIDENCE_WEIGHT[entry.confidence];
    weighed += 1;
    weightSum += weight;
    mass += grams;
    weightedMass += grams * weight;
  }

  if (weighed === 0) return 0;

  // Zero total mass (every weighable line resolved to 0 g) leaves the
  // mass-weighted mean undefined, so fall back to the unweighted one.
  const weighedConfidence = mass > 0 ? weightedMass / mass : weightSum / weighed;
  return weighedConfidence * (weighed / entries.length);
}

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
