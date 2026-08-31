# ADR-0006: Portion-Based Gram Resolution for Nutrition

- **Status:** Accepted
- **Date:** 2026-08-17
- **Issue:** [#1024](https://github.com/jrmoulckers/jrm-recipes/issues/1024),
  [#1025](https://github.com/jrmoulckers/jrm-recipes/issues/1025),
  [#1030](https://github.com/jrmoulckers/jrm-recipes/issues/1030)

## Context

Phase 4 of the food graph (`docs/food-graph.md` §8, ADR-4) delivered per-100 g nutrition per
canonical food and wired a Nutrition Facts panel into the recipe detail page. Extending that work to
anything else — macro search filters, meal-plan roll-ups, cook-log totals, macro targets — surfaced a
defect that made the underlying numbers unsafe to propagate.

### Nutrition is a mass calculation, and half the corpus had no mass

Every nutrition figure in the product is `grams ÷ 100 × per-100 g facts`. Grams therefore gate the
entire system. `units.ts` declares four dimensions — `volume | mass | count | temperature` — and
could reach grams from exactly two of them:

| Dimension | Path to grams     |
| --------- | ----------------- |
| mass      | direct conversion |
| volume    | `× densityGPerMl` |
| count     | **none**          |

There is no arithmetic path from `count` to mass, and there cannot be one: the grams in "1 onion" are
a property of the onion, not of the word "onion". Both roll-up engines simply gave up:

```ts
// src/lib/recipe-nutrition.ts → resolveLineGrams (before)
if (dimension === 'mass')   { ...convert }
if (dimension === 'volume') { ...density }
return null;              // ← the entire count dimension
```

So `2 eggs`, `3 cloves garlic`, `1 bunch parsley`, and `4 chicken thighs` contributed **nothing**.
Only 58 of the 137 curated foods carry a `densityGPerMl`, so every `cup`/`tbsp` measure of the other
79 — all fresh herbs, most spices, cheese, dry pasta — fell through the same hole.

This was not a rare edge. `food-units.ts` suggests `each` as the **default** unit for whole produce,
fruit, and eggs, so the recipe editor's unit picker actively steered cooks toward precisely the units
the roll-up could not read.

### The honesty metric was blind to exactly this error

`rollUpNutrition` reported `massCoverage = accountedGrams / weighableGrams` to keep partial estimates
honest. But an unweighable line never entered `weighableGrams`, so it vanished from both sides of the
ratio. For `1 tbsp olive oil + 6 eggs`:

- `accountedGrams = weighableGrams = 13.5`
- **`massCoverage = 1.0`**

A confident 100% on an estimate that captured about 4% of the food. The metric designed to expose an
incomplete estimate was structurally incapable of seeing the largest source of incompleteness.

### Why this blocked everything downstream

The obvious next step was to persist a derived nutrition cache so search could filter by macros and
the planner could roll a week up. Caching a number that is confidently wrong propagates the error
into ranking, filtering, and dietary-goal features, where it is far harder to detect than on a single
recipe page. **The model had to be corrected before the surface area grew.**

## Decision

**A household measure resolves to grams through curated per-food portion data, not through
arithmetic.** Gram resolution becomes a first-class, shared concern that reports its own
trustworthiness.

### `food_portions`: the missing edge

A new curated table, composite PK (`foodId`, `unit`):

```
food_portions(foodId, unit, gramsPerUnit, modifier, source)
```

Each row states "one `unit` of this food weighs `gramsPerUnit` grams". Rows labelled `usda` are
normalized USDA FoodData Central `food_portion` gram weights (public domain, CC0 1.0). Rows labelled
`kitchen` are hand estimates for informal or generic measures FDC does not publish, such as a
`pinch`, `sprig`, or generic fish fillet.

#### USDA validation completed

The seeded values were subsequently checked against the authoritative
[FoodData Central SR Legacy 2018-04 CSV archive](https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip).
That release is the appropriate stable source because the curated nutrition facts use SR Legacy FDC
records. The archive SHA-256 is
`b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0`; its extracted
`food_portion.csv` SHA-256 is
`6332e29da61e13f7bd950b759461af73303c76e8b0e64dc9df4e41d5347cf3d1`.

[`scripts/verify-food-portions-usda.ts`](../../scripts/verify-food-portions-usda.ts) records each
USDA-labelled row's exact FDC id, portion id, and normalization factor. It reproduces the audit
without committing the upstream dataset:

```sh
pnpm verify:food-portions <path-to-extracted-food_portion.csv>
```

A difference is material when it is both at least **2 g** and more than **10%** of the USDA
reference, or when it exceeds **50%** at any size. The normal two-part threshold reflects
kitchen-scale repeatability and generic-food variation; the extreme-relative guard catches a
doubled herb weight without treating harmless tenths of a gram as exact science.

The audit materially corrected potato (`each` 173 → 213 g), cucumber (`cup` 133 → 104 g), avocado
(`each` 150 → 201 g), corn (`ear` 90 → 102 g), mint (`cup` 30 → 25.6 g), rosemary (`tsp` 1.2 → 0.7
g; `tbsp` 3.3 → 1.7 g), dill (`tbsp` 3 → 0.6 g; `tsp` 1 → 0.2 g), cheddar (`slice` 21 → 28 g), and
mussels (`each` 8 → 10 g). Rows with no defensible matching FDC portion — including garlic heads,
shallots, broccoli heads, individual generic berries, generic fish fillets, and red-pepper flakes —
remain useful estimates but are now labelled `kitchen`, never `usda`.

These data and provenance edits change the portion section of
`nutritionInputsFingerprint()`. The derived `recipe_nutrition_cache` therefore gets a new
`n1.<content hash>` resolver version automatically; the algorithm number remains `1` because the
resolution procedure did not change.

Like `food_nutrition`, this is **curated, not crowd-mined**: it mirrors the static
`src/lib/food-portions.ts` module, is seeded from it, and is untouched by the graph-mining recompute.
`unit` is stored normalized and singular, so `cloves` and `clove` resolve the same row.

This closes the `count` dimension _and_ rescues density-less volume lines, because `1 cup shredded
cheese` becomes a measured portion rather than a computed one.

### One resolver that reports its own confidence

`src/lib/food-grams.ts` replaces both previous gram converters with a single function that answers a
better question — not "how many grams?" but **"how many grams, and how much should you trust it?"**

| Confidence | Path                                    | Weight |
| ---------- | --------------------------------------- | ------ |
| `exact`    | mass unit, pure arithmetic              | 1.0    |
| `portion`  | a curated per-food weight for that unit | 0.8    |
| `density`  | volume × the food's generic g/mL        | 0.6    |
| _(null)_   | no path exists                          | —      |

A curated portion outranks density deliberately: it is measured for _this_ food in _this_ unit,
whereas a density is one scalar averaged across every volume measure of the food. Mass outranks both
because it involves no estimation at all.

An unresolvable line returns `null`, never a zero-gram resolution, so an unknown weight can never be
summed as if it were nothing.

### Consequences

- Count-measured lines now contribute to every estimate that goes through the graph-resolved server
  path. An omelette no longer reports the calories of its cooking oil alone.
- `massCoverage` becomes meaningful for the first time, because the lines that used to disappear from
  its denominator are now weighable. It is still the wrong shape long-term — a _confidence_ roll-up
  weighted by the table above replaces it in a follow-up — but it no longer actively misleads.
  _(Done in [#1027](https://github.com/jrmoulckers/jrm-recipes/issues/1027): `massCoverage` is gone.
  `rollUpNutrition` now reports a `confidence` aggregated over the weights above — mass-weighted
  across the lines it could weigh, diluted by the lines it could not, which stay in the denominator
  at weight 0 — plus the unresolved lines by name, so a surface can say "couldn't weigh: 6 eggs".)_
- `resolveLineGrams` gains an optional `slug`. Callers that omit it keep the previous mass/density
  behaviour exactly, so nothing regresses while the remaining call sites are migrated.
- The estimate becomes _more_ complete, which will move existing displayed numbers upward on recipes
  that use counted ingredients. This is a correction, not a regression; the previous figures were
  understated by construction.
- Portion weights are generic ("1 medium onion"), so an individual recipe can be meaningfully off.
  That is an acceptable and clearly-labelled approximation: an onion estimated within 15% is
  enormously better than an onion counted as zero.
- `food-nutrition.ts` keeps its own private `toGrams` for now. Collapsing the two engines onto this
  resolver is deliberately a separate change, so this one stays reviewable.
  _(Done in [#1029](https://github.com/jrmoulckers/jrm-recipes/issues/1029): `food-nutrition.ts` now
  delegates to this resolver, and the manual → graph → estimate precedence moved out of
  `ingredients-panel.tsx` into `resolveNutritionView`, which tags its answer with provenance.)_

## Alternatives considered

**Persist a nutrition cache first.** The original plan. Rejected because it would have frozen and
propagated a systematically understated estimate into search ranking and dietary features.
_(Now done, in [#1044](https://github.com/jrmoulckers/jrm-recipes/issues/1044) /
[ADR-0007](./0007-versioned-nutrition-cache.md), once the objection above was spent: the cache is
versioned over the curated inputs and the algorithm, so a future correction to portions, densities
or the confidence formula invalidates it rather than being frozen into it.)_

**Infer count weights from mined corpus data.** The graph already mines `food_unit_stats` quantity
percentiles. Rejected as the _source of truth_: the corpus records how much people use, not what it
weighs, and no amount of usage data yields the grams in one egg. Mined data remains the right basis
for suggesting units, not for weighing them.

**Attach one `gramsPerEach` scalar to `food_items`.** Simpler, but it only covers `each` and leaves
`clove`, `bunch`, `sprig`, `can`, and every density-less `cup` unresolved. A portion is inherently a
(food, unit) pair, so the table needs that shape.
