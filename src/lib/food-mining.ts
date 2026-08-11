/**
 * The corpus miner for the live food graph (see `docs/food-graph.md`). Given the
 * site's recipe-ingredient lines, it canonicalizes each `item` onto a food node
 * (via {@link canonicalFood}) and aggregates the raw signal into the graph's
 * stat/edge rows: alias phrasings, unit + quantity affinity, prep affinity, and
 * co-occurrence pairs ranked by lift.
 *
 * Everything here is **pure**: it takes plain rows and returns plain rows, with
 * no `db`/`postgres`/`server-only` import, so the aggregation + ranking logic is
 * unit-testable without a database (mirroring `seed-ingredients.ts`). The server
 * ingestion job feeds `recipe_ingredients` rows in and upserts the result.
 */

import { canonicalFood, normalizeFoodText, type FoodCategory } from './food-db';

/** One recipe-ingredient line, shaped like the `recipe_ingredients` columns. */
export type MinedIngredient = {
  recipeId: string;
  item: string;
  unit?: string | null;
  quantity?: number | null;
  prep?: string | null;
  /** The recipe's author, when known. Drives per-user personalization. */
  authorId?: string | null;
};

/** A canonical node touched by the corpus, with its distinct-recipe popularity. */
export type MinedNode = {
  id: string;
  slug: string;
  name: string;
  category: FoodCategory;
  recipeCount: number;
};

/** A mined phrasing → node, with how often it appeared. */
export type MinedAlias = { foodId: string; alias: string; useCount: number };

/** Unit + quantity affinity for a node: usage count and a quantity distribution. */
export type MinedUnitStat = {
  foodId: string;
  unit: string;
  useCount: number;
  p10: number | null;
  p50: number | null;
  p90: number | null;
};

/** Prep-method affinity for a node. */
export type MinedPrepStat = { foodId: string; prep: string; useCount: number };

/** An undirected co-occurrence edge (`foodAId < foodBId`), with co-count + lift. */
export type MinedPair = {
  foodAId: string;
  foodBId: string;
  coCount: number;
  lift: number;
};

/**
 * A user's learned preference for a food: the unit/prep they most often use, and
 * how many of their lines reference it. `preferredVariantId` is reserved (variety
 * child nodes aren't mined yet) and is always `null` here.
 */
export type MinedUserPref = {
  userId: string;
  foodId: string;
  preferredUnit: string | null;
  preferredVariantId: string | null;
  preferredPrep: string | null;
  useCount: number;
};

/** A food → recipe reverse-index link, with the food's line count in that recipe. */
export type MinedRecipeLink = {
  foodId: string;
  recipeId: string;
  useCount: number;
};

/** The full mined graph, as row-ready arrays for an idempotent upsert. */
export type FoodGraphMining = {
  nodes: MinedNode[];
  aliases: MinedAlias[];
  unitStats: MinedUnitStat[];
  prepStats: MinedPrepStat[];
  pairs: MinedPair[];
  userPrefs: MinedUserPref[];
  recipeLinks: MinedRecipeLink[];
};

export type MiningOptions = {
  /** Minimum recipes an edge must span to be emitted (k-anonymity + noise). */
  minPairCoCount?: number;
  /** Minimum times a phrasing must appear to be emitted as an alias. */
  minAliasUseCount?: number;
};

const DEFAULT_MIN_PAIR_CO_COUNT = 2;
const DEFAULT_MIN_ALIAS_USE_COUNT = 1;

/**
 * Literal token used when an ingredient line has a quantity but no unit
 * ("2 eggs", "1 onion"). Matches the count-token convention the units session
 * relies on (`units.ts` has no count registry), so mined count usage surfaces
 * as `each`.
 */
const COUNT_UNIT_TOKEN = 'each';

/** Field separator for composite map keys (a byte that can't occur in text). */
const SEP = '\u0000';

/** Normalize a unit token: trim + lowercase, empty → the count token `each`. */
function normalizeUnit(unit: string | null | undefined): string {
  const u = (unit ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return (u === '' ? COUNT_UNIT_TOKEN : u).slice(0, 40);
}

/** Normalize a prep token: trim + lowercase. Empty → null (no prep recorded). */
function normalizePrep(prep: string | null | undefined): string | null {
  const p = (prep ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return p === '' ? null : p.slice(0, 200);
}

/** Linear-interpolation percentile of an ascending-sorted numeric array. */
function percentile(sortedAsc: number[], p: number): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0] ?? null;
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const loVal = sortedAsc[lo] ?? 0;
  const hiVal = sortedAsc[hi] ?? loVal;
  return loVal + (hiVal - loVal) * (rank - lo);
}

type UnitBucket = { useCount: number; samples: number[] };

/**
 * Argmax over a token→count map with a deterministic tie-break (lexicographic on
 * the token), so the same corpus always yields the same "preferred" value.
 */
function topToken(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = -1;
  for (const [token, count] of counts) {
    if (count > bestCount || (count === bestCount && (best === null || token < best))) {
      best = token;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Mine a batch of recipe-ingredient lines into the food graph's rows. Lines
 * whose `item` doesn't resolve to a known food are skipped (they don't yet join
 * the graph). Deterministic and order-independent. Safe to run over the whole
 * corpus and upsert the result.
 */
export function mineFoodGraph(
  rows: readonly MinedIngredient[],
  options: MiningOptions = {},
): FoodGraphMining {
  const minPairCoCount = options.minPairCoCount ?? DEFAULT_MIN_PAIR_CO_COUNT;
  const minAliasUseCount = options.minAliasUseCount ?? DEFAULT_MIN_ALIAS_USE_COUNT;

  const nodeMeta = new Map<string, MinedNode>();
  const nodeRecipes = new Map<string, Set<string>>();
  const aliasCounts = new Map<string, number>();
  const unitBuckets = new Map<string, UnitBucket>();
  const prepCounts = new Map<string, number>();
  const recipeNodes = new Map<string, Set<string>>();
  const allRecipes = new Set<string>();

  // Phase 3: per-(user,food) unit/prep tallies + total line count → preferences,
  // and per-(food,recipe) line count → the reverse index.
  const userFoodUnits = new Map<string, Map<string, number>>();
  const userFoodPreps = new Map<string, Map<string, number>>();
  const userFoodUse = new Map<string, number>();
  const userFoodKeys = new Map<string, { userId: string; foodId: string }>();
  const recipeLinkCounts = new Map<string, number>();

  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  const bumpNested = (map: Map<string, Map<string, number>>, outer: string, inner: string) => {
    const sub = map.get(outer) ?? map.set(outer, new Map()).get(outer)!;
    sub.set(inner, (sub.get(inner) ?? 0) + 1);
  };

  for (const row of rows) {
    const canon = canonicalFood(row.item);
    if (!canon) continue;
    const id = canon.id;

    allRecipes.add(row.recipeId);
    if (!nodeMeta.has(id)) {
      nodeMeta.set(id, {
        id,
        slug: canon.slug,
        name: canon.name,
        category: canon.category,
        recipeCount: 0,
      });
    }
    (nodeRecipes.get(id) ?? nodeRecipes.set(id, new Set()).get(id)!).add(row.recipeId);
    (
      recipeNodes.get(row.recipeId) ?? recipeNodes.set(row.recipeId, new Set()).get(row.recipeId)!
    ).add(id);

    bump(recipeLinkCounts, `${id}${SEP}${row.recipeId}`);

    const alias = normalizeFoodText(row.item).slice(0, 160);
    if (alias) bump(aliasCounts, `${id}${SEP}${alias}`);

    const unit = normalizeUnit(row.unit);
    const unitKey = `${id}${SEP}${unit}`;
    const bucket = unitBuckets.get(unitKey) ?? { useCount: 0, samples: [] };
    bucket.useCount += 1;
    if (typeof row.quantity === 'number' && Number.isFinite(row.quantity)) {
      bucket.samples.push(row.quantity);
    }
    unitBuckets.set(unitKey, bucket);

    const prep = normalizePrep(row.prep);
    if (prep) bump(prepCounts, `${id}${SEP}${prep}`);

    const authorId = row.authorId;
    if (authorId) {
      const ufKey = `${authorId}${SEP}${id}`;
      if (!userFoodKeys.has(ufKey)) userFoodKeys.set(ufKey, { userId: authorId, foodId: id });
      userFoodUse.set(ufKey, (userFoodUse.get(ufKey) ?? 0) + 1);
      bumpNested(userFoodUnits, ufKey, unit);
      if (prep) bumpNested(userFoodPreps, ufKey, prep);
    }
  }

  const nodes: MinedNode[] = [];
  for (const node of nodeMeta.values()) {
    nodes.push({
      ...node,
      recipeCount: nodeRecipes.get(node.id)?.size ?? 0,
    });
  }

  const aliases: MinedAlias[] = [];
  for (const [key, useCount] of aliasCounts) {
    if (useCount < minAliasUseCount) continue;
    const [foodId, alias] = key.split(SEP);
    aliases.push({ foodId: foodId!, alias: alias!, useCount });
  }

  const unitStats: MinedUnitStat[] = [];
  for (const [key, bucket] of unitBuckets) {
    const [foodId, unit] = key.split(SEP);
    const sorted = [...bucket.samples].sort((a, b) => a - b);
    unitStats.push({
      foodId: foodId!,
      unit: unit!,
      useCount: bucket.useCount,
      p10: percentile(sorted, 10),
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
    });
  }

  const prepStats: MinedPrepStat[] = [];
  for (const [key, useCount] of prepCounts) {
    const [foodId, prep] = key.split(SEP);
    prepStats.push({ foodId: foodId!, prep: prep!, useCount });
  }

  const pairs = buildPairs(recipeNodes, nodeRecipes, allRecipes.size, minPairCoCount);

  const userPrefs: MinedUserPref[] = [];
  for (const [ufKey, { userId, foodId }] of userFoodKeys) {
    userPrefs.push({
      userId,
      foodId,
      preferredUnit: topToken(userFoodUnits.get(ufKey) ?? new Map<string, number>()),
      preferredVariantId: null,
      preferredPrep: topToken(userFoodPreps.get(ufKey) ?? new Map<string, number>()),
      useCount: userFoodUse.get(ufKey) ?? 0,
    });
  }

  const recipeLinks: MinedRecipeLink[] = [];
  for (const [key, useCount] of recipeLinkCounts) {
    const [foodId, recipeId] = key.split(SEP);
    recipeLinks.push({ foodId: foodId!, recipeId: recipeId!, useCount });
  }

  return {
    nodes,
    aliases,
    unitStats,
    prepStats,
    pairs,
    userPrefs,
    recipeLinks,
  };
}

/** Build undirected co-occurrence edges with precomputed lift. */
function buildPairs(
  recipeNodes: Map<string, Set<string>>,
  nodeRecipes: Map<string, Set<string>>,
  totalRecipes: number,
  minCoCount: number,
): MinedPair[] {
  const coCounts = new Map<string, number>();
  for (const nodeSet of recipeNodes.values()) {
    const ids = [...nodeSet].sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}${SEP}${ids[j]}`;
        coCounts.set(key, (coCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const pairs: MinedPair[] = [];
  for (const [key, coCount] of coCounts) {
    if (coCount < minCoCount) continue;
    const [a, b] = key.split(SEP);
    const countA = nodeRecipes.get(a!)?.size ?? 0;
    const countB = nodeRecipes.get(b!)?.size ?? 0;
    // lift = P(A,B) / (P(A)·P(B)) = (coCount·N) / (countA·countB).
    const lift =
      countA > 0 && countB > 0 && totalRecipes > 0
        ? (coCount * totalRecipes) / (countA * countB)
        : 0;
    pairs.push({ foodAId: a!, foodBId: b!, coCount, lift });
  }
  return pairs;
}

// --- Serving-side ranking (pure, so it can be unit-tested) ----------------

/** A ranked near-neighbour: the other food plus its aggregated edge strength. */
export type NeighbourRank = { foodId: string; coCount: number; lift: number };

/** A stored co-occurrence edge, as read back from `food_pairs`. */
export type PairEdge = {
  foodAId: string;
  foodBId: string;
  coCount: number;
  lift: number | null;
};

export type NeighbourOptions = {
  /** Drop edges thinner than this before ranking (surfacing threshold). */
  minCoCount?: number;
  /** Max neighbours to return. */
  limit?: number;
  /** Extra node ids to exclude from results (e.g. already in the recipe). */
  exclude?: readonly string[];
};

/**
 * Rank near-neighbours for one or more query foods from stored edges. Edges
 * touching a query node contribute their partner as a candidate. Candidates are
 * scored by summed `lift` across the query set (tie-broken by `coCount`), with
 * the query nodes and any `exclude` ids removed. Distinctive pairings surface
 * above ubiquitous ones. Pure + deterministic.
 */
export function rankNeighbours(
  edges: readonly PairEdge[],
  queryNodeIds: readonly string[],
  options: NeighbourOptions = {},
): NeighbourRank[] {
  const minCoCount = options.minCoCount ?? 1;
  const query = new Set(queryNodeIds);
  const excluded = new Set([...(options.exclude ?? []), ...queryNodeIds]);

  const scored = new Map<string, NeighbourRank>();
  for (const edge of edges) {
    if (edge.coCount < minCoCount) continue;
    const aIn = query.has(edge.foodAId);
    const bIn = query.has(edge.foodBId);
    // Exactly one endpoint is a query node → the other is a candidate.
    if (aIn === bIn) continue;
    const neighbour = aIn ? edge.foodBId : edge.foodAId;
    if (excluded.has(neighbour)) continue;
    const lift = edge.lift ?? 0;
    const prev = scored.get(neighbour);
    if (prev) {
      prev.lift += lift;
      prev.coCount += edge.coCount;
    } else {
      scored.set(neighbour, { foodId: neighbour, coCount: edge.coCount, lift });
    }
  }

  const ranked = [...scored.values()].sort(
    (a, b) => b.lift - a.lift || b.coCount - a.coCount || a.foodId.localeCompare(b.foodId),
  );
  return options.limit != null ? ranked.slice(0, options.limit) : ranked;
}

/** A stored unit stat row, as read back from `food_unit_stats`. */
export type UnitStatRow = {
  unit: string;
  useCount: number;
  p10: number | null;
  p50: number | null;
  p90: number | null;
};

export type UnitStatRankOptions = { minUseCount?: number; limit?: number };

/**
 * Order a food's unit stats by popularity (most-used first), dropping units
 * below `minUseCount`. Pure. The DB layer just fetches rows and calls this.
 */
export function rankUnitStats(
  rows: readonly UnitStatRow[],
  options: UnitStatRankOptions = {},
): UnitStatRow[] {
  const minUseCount = options.minUseCount ?? 1;
  const ranked = rows
    .filter((r) => r.useCount >= minUseCount)
    .sort((a, b) => b.useCount - a.useCount || a.unit.localeCompare(b.unit));
  return options.limit != null ? ranked.slice(0, options.limit) : ranked;
}
