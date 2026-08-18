# ADR-0006: Portion-Based Gram Resolution for Nutrition

- **Status:** Accepted
- **Date:** 2026-08-17
- **Issue:** [#1024](https://github.com/jrmoulckers/jrm-recipes/issues/1024),
  [#1025](https://github.com/jrmoulckers/jrm-recipes/issues/1025)

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

Each row states "one `unit` of this food weighs `gramsPerUnit` grams". Values are generic USDA
FoodData Central `food_portion` gram weights (public domain, CC0 1.0) — the same dataset already
cited in `food_nutrition.sourceRef` — plus a small set of `kitchen` rows for informal measures FDC
does not publish (`pinch`, `sprig`).

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

**Infer count weights from mined corpus data.** The graph already mines `food_unit_stats` quantity
percentiles. Rejected as the _source of truth_: the corpus records how much people use, not what it
weighs, and no amount of usage data yields the grams in one egg. Mined data remains the right basis
for suggesting units, not for weighing them.

**Attach one `gramsPerEach` scalar to `food_items`.** Simpler, but it only covers `each` and leaves
`clove`, `bunch`, `sprig`, `can`, and every density-less `cup` unresolved. A portion is inherently a
(food, unit) pair, so the table needs that shape.
