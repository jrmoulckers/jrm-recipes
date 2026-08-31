/**
 * The nutrition **resolver version** (issue #1044).
 *
 * A derived nutrition cache is only safe to keep if it can be invalidated when
 * the thing that derived it changes. Without a version, changing a portion
 * weight or a confidence tier does not make a single cached row look wrong — it
 * makes every cached row silently, permanently disagree with what the resolver
 * would now produce. A cache with no version is a cache you can never safely
 * change the inputs to, which in practice means the inputs stop changing.
 *
 * The version is stored on every cached row, and a row whose version differs
 * from {@link NUTRITION_RESOLVER_VERSION} is treated as a miss. So a change to
 * any input invalidates cleanly rather than serving stale numbers indefinitely.
 *
 * ## Two halves, because there are two kinds of input
 *
 * The answer is a function of both **data** and **code**, and only one of those
 * can be hashed:
 *
 * | Half              | Covers                                                         | How it moves                    |
 * | ----------------- | -------------------------------------------------------------- | ------------------------------- |
 * | {@link NUTRITION_ALGORITHM_VERSION} | the *shape* of the computation — resolution order in `resolveGramsForSlug`, the `aggregateConfidence` formula, the precedence ladder in `resolveNutritionView` | hand-bumped, deliberately |
 * | the content hash  | the *values* — portion weights, densities, curated facts, the `CONFIDENCE_WEIGHT` tiers, the nutrient registry | automatic, on every data edit   |
 *
 * The content hash is what makes this hard to forget, and it is the half that
 * actually moves: #1030 validated and revised portion gram weights against USDA
 * `food_portion.csv`, and those edits bust the cache with no accompanying
 * constant to remember. Hand-bumping is reserved for the rarer case a hash cannot
 * see — a formula rewrite over identical data — and is called out in the
 * constant's own doc comment.
 *
 * ## Cost
 *
 * Hashing is done once, lazily, on first use, over a canonical serialization of
 * the curated datasets (a few hundred kilobytes). {@link stableHash} is a pure
 * two-accumulator FNV-1a variant, so this is a single linear pass with no
 * dependency and no crypto. Subsequent calls return the memoized string.
 *
 * Pure and framework-free, so the version can be asserted in unit tests and
 * derived identically by the app, the backfill script, and any future job.
 */

import { FOOD_ITEMS, foodSlug, stableHash } from './food-db';
import { CONFIDENCE_WEIGHT } from './food-grams';
import { NUTRITION_BY_SLUG } from './food-nutrition';
import { allPortions } from './food-portions';
import { NUTRIENT_IDS, NUTRIENT_REGISTRY } from './nutrients';

/**
 * The hand-bumped half of the version: the shape of the computation.
 *
 * **Bump this when you change how the answer is computed over unchanged data.**
 * Specifically: the resolution order or tie-breaking in
 * `resolveGramsForSlug`, the `aggregateConfidence` formula, the precedence
 * ladder in `resolveNutritionView`, or the units/rounding of what is stored.
 *
 * You do **not** need to bump it for a data edit — a new portion weight, a
 * changed density, a new nutrient, a retuned `CONFIDENCE_WEIGHT` tier. The
 * content hash below already covers those.
 *
 * History:
 *  - `1` — initial versioned cache (#1044), over the resolver as it stands
 *    after #1025 / #1027 / #1028 / #1029.
 */
export const NUTRITION_ALGORITHM_VERSION = 1;

/** Fixed-precision so a float's decimal rendering can't drift the hash. */
function num(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '~' : value.toFixed(6);
}

/**
 * Free text can contain the separators this format uses (a portion modifier such
 * as `ear, kernels` does), which would split one entry into two and make the
 * sort — and therefore the digest — depend on where the comma fell. Neutralize
 * them so every entry stays atomic.
 */
function field(value: string | null | undefined): string {
  return (value ?? '').replace(/[,|\n]/g, ' ');
}

/**
 * A canonical, order-independent serialization of every curated input the
 * resolver reads. Sorted at every level so map/array iteration order can never
 * move the digest on its own — a reordered `FOOD_ITEMS` is not a change to the
 * answer and must not invalidate the cache.
 *
 * Exported for testing: a test can assert that reordering inputs leaves this
 * stable while changing a value does not.
 */
export function nutritionInputsFingerprint(): string {
  const parts: string[] = [];

  // 1. Curated per-food portion weights (`food-portions.ts`) — the count → grams
  //    edge, and the largest single lever on the answer.
  parts.push(
    'portions:' +
      allPortions()
        .map(
          ({ slug, portion }) =>
            `${slug}|${portion.unit}|${num(portion.gramsPerUnit)}|${field(portion.modifier)}|${portion.source}`,
        )
        .sort()
        .join(','),
  );

  // 2. Densities (`food-db.ts`) — the volume → grams edge.
  parts.push(
    'densities:' +
      FOOD_ITEMS.map((item) => `${foodSlug(item.name)}|${num(item.densityGPerMl)}`)
        .sort()
        .join(','),
  );

  // 3. Curated per-100 g facts (`food-nutrition.ts`). Projected through the
  //    registry so the nutrients that actually reach a roll-up are what's
  //    hashed.
  parts.push(
    'facts:' +
      [...NUTRITION_BY_SLUG.entries()]
        .map(
          ([slug, facts]) =>
            `${slug}|${NUTRIENT_IDS.map((id) => num(facts[id])).join('/')}|${field(facts.sourceRef)}`,
        )
        .sort()
        .join(','),
  );

  // 4. The confidence tiers (`food-grams.ts`). Retuning `portion` from 0.8
  //    changes every graph-sourced recipe's confidence without touching a
  //    single value above.
  parts.push(
    'weights:' +
      Object.entries(CONFIDENCE_WEIGHT)
        .map(([k, v]) => `${k}|${num(v)}`)
        .sort()
        .join(','),
  );

  // 5. The nutrient registry (`nutrients.ts`). Adding a nutrient changes which
  //    keys a cached `perServing` can carry, so a cached row written before it
  //    is incomplete rather than merely imprecise.
  parts.push(
    'nutrients:' +
      NUTRIENT_REGISTRY.map(
        (n) => `${n.id}|${n.nutritionKey}|${n.unit}|${num(n.dailyValue)}|${n.displayPrecision}`,
      )
        .sort()
        .join(','),
  );

  return parts.join('\n');
}

let memoized: string | undefined;

/**
 * The version every cached nutrition row is stamped with, e.g. `n1.4kq2p1x0z`.
 *
 * Shaped `n<algorithm>.<content hash>` so the two halves stay legible in a
 * database row: a version that moved only after the dot was a data edit, one
 * that moved before it was a deliberate formula change.
 */
export function nutritionResolverVersion(): string {
  memoized ??= `n${NUTRITION_ALGORITHM_VERSION}.${stableHash(nutritionInputsFingerprint())}`;
  return memoized;
}
