# ADR-0007: Versioned Derived Nutrition Cache

- **Status:** Accepted
- **Date:** 2026-08-19
- **Issue:** [#1024](https://github.com/jrmoulckers/jrm-recipes/issues/1024),
  [#1044](https://github.com/jrmoulckers/jrm-recipes/issues/1044)

## Context

Persisting nutrition was the original request that uncovered the overhaul recorded in
[ADR-0006](./0006-portion-based-gram-resolution.md), and that ADR rejected doing it first:
caching a systematically understated estimate would have frozen it into search ranking and
dietary features, where a wrong number is far harder to notice than on a single recipe page.

Those objections are now spent. #1025 gave count-measured lines a mass, #1027 replaced
`massCoverage` with an aggregated `confidence` plus the unresolved lines by name, #1028 made a
nutrient nothing sourced **absent** rather than `0`, and #1029 collapsed the two estimation
engines onto one resolver and tagged its answer with provenance. The result is exactly one
function worth caching:

```ts
getRecipeNutritionView(recipeId, manual): { perServing, provenance }
```

with `provenance.source` in `manual | graph | estimate | none`.

Every read of a recipe's nutrition resolves every ingredient line against the food graph, looks up
curated portions and densities, and rolls the result up. It is pure, deterministic, and entirely a
function of stored recipe rows plus a set of curated tables in the repository — which is precisely
the shape that is safe to cache and dangerous to cache _carelessly_.

## Decision

Add one derived cache table, `recipe_nutrition_cache`, keyed by `recipe_id`, holding the computed
`perServing` values **together with their provenance** and stamped with the **resolver version**
that produced them.

Cache `getRecipeNutritionView` and nothing else. No second path is added around it: the request
path, the backfill script, and the post-save refresh all reach the same computation
(`nutrition-compute.ts`), so a cached number and a freshly computed one cannot drift — the failure
mode #1029 existed to remove.

### The row carries its provenance, not just its numbers

`source`, `confidence`, `sourced_lines`, `total_lines` and `unresolved_lines` are stored alongside
`per_serving`. A cached number without its provenance is indistinguishable from a cook's manual
override, which is exactly the ambiguity #1029 removed; re-introducing it in the storage layer
would undo that work silently.

A `manual` view is therefore **never cached at all**. The cook's own numbers already live on
`recipes` and short-circuit the resolver before any database read, so a cached copy would be a
duplicate of a value that is not derived. A `none` view _is_ cached: "nothing could be sourced" is
a real answer that cost a full resolve to reach.

`unresolved_lines` **round trips** through the cache rather than being recomputed. Recomputing the
named lines means resolving every ingredient against the graph again, which is the whole of the
work the cache exists to avoid.

### Absent is not zero, in both directions

After #1028 a nutrient nothing sourced is absent, not `0`, and the two are different claims:
absent means "unknown", `0` means "measured, and there is none". `per_serving` is stored as
`jsonb`, so absence is literal key absence, and a single `sanitizeNutrition` guard runs on the way
in _and_ on the way out — only registry-declared keys with finite numbers survive, `null` and
`undefined` are dropped, and `0` is kept. A serializer that normalized absent keys to `0`, or a
deserializer that defaulted them, would reintroduce the confident falsehood #1028 removed, and
would do it invisibly because both shapes render.

### Write strategy: invalidate in the transaction, refresh after it commits, never write on read

There is deliberately **no read-and-write-through**. A recipe page can be requested concurrently by
many readers, and having each of them race to populate the same row is how a cache ends up holding
whichever computation happened to finish last — including one that started before an edit and
finished after it.

1. **Invalidate inside the write transaction.** `invalidateNutritionCache(tx, id)` deletes the row
   in the same transaction that rewrites the recipe's ingredient lines, so the delete commits
   atomically with the edit. There is no instant at which the new lines and the old figures are
   both visible.
2. **Refresh after the commit**, best-effort and non-throwing. The recompute reads the rows the
   transaction just wrote, and a cache write is not worth extending a lock for.
3. **Reads never write.** A miss computes and returns; the request path stays pure, and the cost of
   a miss is exactly what every read cost before this existed.

The consequence is the one worth having: **staleness is impossible, only misses are.** Every
failure mode — a failed refresh, a lost race, an unreachable database — degrades to recomputation,
never to a wrong number.

Two guards keep a slow refresh from winning a race it should lose. The insert selects from
`recipes` with `date_trunc('milliseconds', r.updated_at) <= <observed>`, so a recipe saved again
since the computation started stores nothing; and the `ON CONFLICT` update refuses to overwrite a
row whose `recipe_updated_at` is newer than the incoming one, so two refreshes landing out of order
converge on the newer values rather than on the later write. (The truncation is not cosmetic:
`updated_at` is written by `now()` at microsecond precision but read back into a
millisecond-precision JS `Date`, so an untruncated comparison would reject every write.)

Ingredient-link edits outside a recipe save go through exactly one path,
`scripts/backfill-food-links.ts`, which now deletes the cached rows of every recipe whose links it
changed. Changing which food a line resolves to changes the answer as surely as editing the line.

### Versioning: a hand-bumped algorithm number _and_ an automatic content hash

The version is `n<algorithm>.<content hash>`, e.g. `n1.4kq2p1x0z`, and a row stamped with any other
version is a **miss**, filtered in SQL so a stale row costs nothing to skip.

- The **content hash** covers the curated _values_: portion gram weights (`food-portions.ts`),
  densities (`food-db.ts`), per-100 g facts (`food-nutrition.ts`), the `CONFIDENCE_WEIGHT` tiers
  (`food-grams.ts`) and the nutrient registry (`nutrients.ts`). It is derived from a canonical,
  sorted, fixed-precision serialization, so reordering `FOOD_ITEMS` cannot move it but changing a
  gram weight always does.
- The **hand-bumped `NUTRITION_ALGORITHM_VERSION`** covers the _shape_ of the computation — the
  resolution order in `resolveGramsForSlug`, the `aggregateConfidence` formula, the
  `resolveNutritionView` ladder. A data hash cannot see a change to code that reads the same data
  differently.

Neither alone is sufficient, and the hash is the half that matters most in practice.
[#1030](https://github.com/jrmoulckers/jrm-recipes/issues/1030) will revise many portion gram
weights against the real USDA `food_portion.csv`; the hash makes that invalidation impossible to
forget, which a hand-bumped constant alone would not. The split format keeps both halves legible
in a database row: a version that moved only after the dot was a data edit, one that moved before
it was a deliberate formula change.

Absent numbers render as `~` in the fingerprint, never as `0.000000`, so the absent-vs-zero
distinction holds in the version derivation too.

### Rollout

`pnpm db:backfill-nutrition` (`scripts/backfill-nutrition-cache.ts`) populates the table in
batches. It is resumable and idempotent with no cursor file: a recipe is "done" when it has a row
at the _current_ resolver version, so re-runs are self-terminating. That makes it the rollout
mechanism for a version change as well as for the initial fill — after #1030 lands, running it
again re-derives every row rather than waiting for organic traffic.

The migration is expand-only per `docs/migrations.md`: a new table, guarded with `IF NOT EXISTS`,
nothing dropped and nothing altered. Contract, if it is ever needed, is a separate change.

## Consequences

- A recipe's nutrition is computed once per edit rather than once per view, which is what makes it
  affordable to put nutrition into search ranking, dietary filters and meal-plan roll-ups — the
  features ADR-0006 deferred.
- The cache can be invalidated by editing a repository file. Changing a portion weight moves the
  content hash, which makes every existing row a miss immediately and correctly, at the cost of a
  period of recomputation until the backfill catches up. This is the intended trade: correctness is
  never deferred to a deploy step somebody might skip.
- A resolver-version change invalidates _globally_, not per recipe. A change that affects one food
  busts rows for recipes that never mention it. Finer-grained invalidation would require tracking
  which foods each cached row read, which is more machinery than the recompute cost justifies.
- `nutrition-compute.ts` takes an injected drizzle client rather than importing the global one, so
  the backfill script can run outside Next against its own connection without reimplementing — and
  drifting from — the served computation.
- Reads gain a database round trip on a miss, on top of the computation they already did. The trip
  is a single primary-key lookup and never throws: a cache that cannot be read is a cache miss.
