# ADR-0008: Aggregate Nutrition Confidence Across Meals

- **Status:** Accepted
- **Date:** 2026-08-20
- **Issue:** [#1024](https://github.com/jrmoulckers/jrm-recipes/issues/1024),
  [#1048](https://github.com/jrmoulckers/jrm-recipes/issues/1048)

## Context

[ADR-0006](./0006-portion-based-gram-resolution.md) gave a single recipe's nutrition an honest
`confidence` in 0–1 alongside the lines that could not be weighed, and
[ADR-0007](./0007-versioned-nutrition-cache.md) made that answer cheap to read. The planner and the
cook log now want a number spanning many recipes: this week's calories, this month's protein.

Summing the nutrition is arithmetic. Combining the confidences is not, and getting it wrong
reintroduces the exact defect the overhaul removed — a figure that looks authoritative because the
part nobody could measure quietly left the denominator.

The line-level analogue already exists: `aggregateConfidence` in `src/lib/food-grams.ts` weights
each ingredient line by its mass, then dilutes the result by the share of lines that produced no
mass at all, precisely so an unweighable line cannot vanish from its own average.

## Decision

An aggregate confidence is a **ratio of quantities**, not a mean of scores.

A meal reporting `E` kcal at confidence `c` is understood to have captured `c` of the food that was
really there, so it implies `E / c` kcal of true food. Across meals:

```
confidence = Σ Eᵢ  ÷  Σ (Eᵢ / cᵢ)
```

— captured food ÷ implied true food. Formally this is the energy-weighted _harmonic_ mean of the
per-meal confidences.

Per-meal confidence comes from provenance: `manual → 1` (the cook's own numbers are a statement,
not an estimate), `graph` and `estimate` → their own `confidence` clamped to 0–1, `none → 0`.

A meal with no energy to weight — `source: 'none'`, or nutrition carrying no `calories` — has no
mass, which is exactly what failed about it. Mirroring `aggregateConfidence`, those meals dilute by
their share of the meal **count**: the ratio above is multiplied by `counted / total`. If every
counted meal reports zero energy, the fallback is the unweighted mean of the counted meals.

The unresolved lines are carried up too, each tagged with the meal it came from, and meals that
resolved to nothing are named. A cook told _"6 eggs in Tuesday's dinner couldn't be weighed"_ can
fix it; one shown a bare percentage cannot.

## Alternatives rejected

**Plain average of per-meal confidence.** Nine exact recipes and one recipe with three unweighed
ingredients reads `0.96`. Worse, it is indifferent to what the unreliable meal _is_: an unweighable
garnish and an unweighable Sunday roast move a week's number by the same amount, when only one of
them meaningfully changes the totals.

**Calorie-weighted arithmetic average.** The obvious fix, and strictly worse than the plain
average, because the weight is corrupted by the very failure it is meant to measure. A recipe that
resolved a tenth of its food reports roughly a tenth of its calories, so weighting by _reported_
calories weights the meal we know least about at nearly nothing:

```
(9 × 500 × 1.0  +  50 × 0.1) ÷ (9 × 500 + 50)  =  0.999
```

That is the `massCoverage` denominator leak reappearing one level up. The ratio formula returns
`4500 / 5000 ≈ 0.91` for the same week, because it asks what the low-confidence meal _implies_ was
there rather than what it managed to report.

The mirror case still behaves: a 2000 kcal day plus an unweighable 5 kcal garnish stays above
`0.95`, where a plain average would report `0.55`.

## Consequences

- One number, one meaning, at both levels: `confidence` always answers "what share of the real food
  is behind this figure", whether the scope is a line, a recipe, or a week.
- A single badly-resolved main course visibly drags a week down, which is the point.
- Aggregation is a pure function in `src/lib/nutrition-rollup.ts` with no framework or database
  dependency, so the rule is testable in isolation and is shared verbatim by the planner and the
  cook log.
- Reads go through `getRecipeNutritionViews`, a batched sibling of `getRecipeNutritionView` living
  beside it in `src/server/recipes/nutrition.ts` and routed through the same resolution path. A week
  of plans costs one manual-column query plus one cached-row query, not a query per recipe. There is
  still exactly one place that decides what a recipe's nutrition is.
- The scope of a roll-up is always the meals actually on screen, so the number reconciles with the
  list beneath it.
