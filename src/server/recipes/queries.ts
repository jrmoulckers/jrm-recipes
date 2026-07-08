import "server-only";

import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  compareByTopRated,
  excludeOwnerRatings,
  ratingSummary,
  summaryFromAggregates,
  TOP_RATED_PRIOR_COUNT,
  TOP_RATED_PRIOR_MEAN,
  type RatingSort,
} from "~/lib/ratings";
import { summarizeAllergens, isAllergen, type Allergen } from "~/lib/allergens";
import { isDietaryTag } from "~/lib/substitutions";
import { hasAllergenConflict } from "~/lib/dietary-match";
import {
  groupMembers,
  memberDietaryProfiles,
  recipeEvents,
  recipeIngredients,
  recipeSteps,
  recipeTags,
  recipeVersions,
  recipeViews,
  recipes,
  tags,
  cookLogEntries,
  favorites,
  type User,
} from "~/server/db/schema";
import { recipeInput, type RecipeInput } from "./validation";
import {
  clampPageSize,
  DISCOVER_PAGE_SIZE,
  FORK_LIST_CAP,
  nextPageOffset,
  toCursorPage,
  TIMELINE_EVENT_PAGE_SIZE,
  VERSION_HISTORY_PAGE_SIZE,
} from "./pagination";
import { expandQueryTerms } from "~/lib/search-synonyms";
import { deriveMatchReason } from "~/lib/search-match";
import { rankBySimilarity, tokenizeIngredients } from "~/lib/related-recipes";
import { rankByCoverage } from "~/lib/ingredient-coverage";
import {
  tagFilterSlug,
  type RecipeSearch,
  type RecipeSort,
} from "./search";
import { assembleTimeline, type TimelineEntry } from "./timeline";

/**
 * Shared predicate excluding soft-deleted recipes (issue #165). Every recipe
 * read path ANDs this in so tombstoned rows never surface in a list, detail,
 * search, lineage, timeline, or facet — while their child history (versions,
 * events, ratings, comments) is preserved and returns intact on restore.
 */
const notDeleted = isNull(recipes.deletedAt);

/** Recipe with everything needed to render a detail page. */
export type FullRecipe = NonNullable<Awaited<ReturnType<typeof getRecipe>>>;
export type RecipeListItem = Awaited<ReturnType<typeof listMyRecipes>>[number];
export type PublicRecipeListItem = Awaited<
  ReturnType<typeof listPublicRecipes>
>["items"][number];
export type RecipeSearchResult = Awaited<
  ReturnType<typeof searchRecipes>
>[number];
export type CookWithResult = Awaited<
  ReturnType<typeof searchByIngredients>
>[number];
export type RecipeFacets = Awaited<ReturnType<typeof listRecipeFacets>>;
/** One page of a recipe's saved versions, newest first (#159). */
export type VersionHistoryPage = Awaited<ReturnType<typeof getRecipeVersions>>;
export type VersionListItem = VersionHistoryPage["items"][number];

/** Re-exported for recipe detail pages that import it from the query module. */
export { excludeOwnerRatings, ratingSummary };

/**
 * Re-order a fetched list so the highest-rated recipes come first, using each
 * recipe's denormalized, owner-excluded aggregates (issue #154). Used for lists
 * that are already fully loaded (e.g. a viewer's library); paged/searched feeds
 * order in SQL via {@link topRatedOrderBy} instead so the ranking is global
 * rather than per-window. `"recent"` keeps the DB order untouched.
 */
function applyRatingSort<
  T extends { ratingCount: number; ratingSum: number },
>(rows: T[], sort: RatingSort): T[] {
  if (sort !== "top-rated") return rows;
  return [...rows].sort((a, b) =>
    compareByTopRated(
      summaryFromAggregates(a.ratingCount, a.ratingSum),
      summaryFromAggregates(b.ratingCount, b.ratingSum),
    ),
  );
}

/**
 * Per-recipe weighted "top rated" score, read straight from the denormalized
 * aggregates on `recipes` (issue #154) rather than a correlated subquery over
 * `ratings`, so the feed no longer scans the ratings table per row. Mirrors
 * `bayesianScore` in `~/lib/ratings`: `(sum + prMean*prCount) / (count +
 * prCount)`. Exported for unit assertions.
 */
export function topRatedScoreSql(): SQL {
  const priorSum = TOP_RATED_PRIOR_MEAN * TOP_RATED_PRIOR_COUNT;
  return sql`((${recipes.ratingSum} + ${priorSum})::float
     / (${recipes.ratingCount} + ${TOP_RATED_PRIOR_COUNT})::float)`;
}

/** Whether a recipe has any non-owner rating, so unrated recipes sort last. */
function topRatedHasRatingsSql(): SQL {
  return sql`(${recipes.ratingCount} > 0)`;
}

/**
 * ORDER BY for the "top rated" feed: rated recipes first, then by the weighted
 * score, tie-broken by recency for a stable page walk. Because the score is a
 * SQL aggregate over every rating, `limit`/`offset` slice the true global order.
 */
export function topRatedOrderBy(): SQL[] {
  return [
    desc(topRatedHasRatingsSql()),
    desc(topRatedScoreSql()),
    desc(sql`coalesce(${recipes.publishedAt}, ${recipes.createdAt})`),
    desc(recipes.createdAt),
  ];
}

/**
 * Per-recipe weighted "best match" relevance score for a text query, computed
 * in SQL so ordering is global across the whole candidate set rather than a
 * re-sort of one page. Field weights encode intent: a title hit (5) beats a tag
 * (4), cuisine (3), ingredient (2), and finally a description mention (1). A
 * recipe that matches several fields sums their weights. `like` is the already
 * LIKE-escaped `%term%` pattern. Exported for unit assertions.
 */
export function relevanceScoreSql(like: string): SQL {
  return sql`(
    (case when ${recipes.title} ilike ${like} then 5 else 0 end)
    + (case when exists(
        select 1 from ${recipeTags}
        inner join ${tags} on ${recipeTags.tagId} = ${tags.id}
        where ${recipeTags.recipeId} = ${recipes.id}
          and ${tags.name} ilike ${like}
      ) then 4 else 0 end)
    + (case when ${recipes.cuisine} ilike ${like} then 3 else 0 end)
    + (case when exists(
        select 1 from ${recipeIngredients}
        where ${recipeIngredients.recipeId} = ${recipes.id}
          and ${recipeIngredients.item} ilike ${like}
      ) then 2 else 0 end)
    + (case when ${recipes.description} ilike ${like} then 1 else 0 end)
  )`;
}

/**
 * ORDER BY for the "Best match" feed: highest weighted field-match score first,
 * tie-broken by the weighted rating score then recency for a stable walk. Since
 * the score is a SQL expression over each row, `limit`/`offset` slice the true
 * global ranking.
 */
export function relevanceOrderBy(like: string): SQL[] {
  return [
    desc(relevanceScoreSql(like)),
    desc(topRatedScoreSql()),
    desc(sql`coalesce(${recipes.publishedAt}, ${recipes.createdAt})`),
    desc(recipes.createdAt),
  ];
}

/**
 * Per-recipe popularity score = number of times it was cooked + number of times
 * it was saved (favorited), computed in SQL so the ranking is global across the
 * candidate set. Popularity is a rating-independent signal of what the family
 * actually makes and keeps. Exported for unit assertions.
 */
export function popularityScoreSql(): SQL {
  return sql`(
    (select count(*) from ${cookLogEntries}
       where ${cookLogEntries.recipeId} = ${recipes.id})
    + (select count(*) from ${favorites}
       where ${favorites.recipeId} = ${recipes.id})
  )`;
}

/** Whether a recipe has any cook-log or favorite, so inert recipes sort last. */
function popularHasActivitySql(): SQL {
  return sql`(
    exists(select 1 from ${cookLogEntries}
      where ${cookLogEntries.recipeId} = ${recipes.id})
    or exists(select 1 from ${favorites}
      where ${favorites.recipeId} = ${recipes.id})
  )`;
}

/**
 * ORDER BY for the "Popular" feed: recipes with any activity first, then by the
 * cook+save score (descending, so a more-cooked/-saved recipe outranks a
 * quieter one), tie-broken by recency.
 */
export function popularOrderBy(): SQL[] {
  return [
    desc(popularHasActivitySql()),
    desc(popularityScoreSql()),
    desc(sql`coalesce(${recipes.publishedAt}, ${recipes.createdAt})`),
    desc(recipes.createdAt),
  ];
}

/** Groups a user belongs to (for the editor's visibility picker). */
export async function listUserGroups(
  userId: string,
): Promise<{ id: string; name: string }[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    with: { group: { columns: { id: true, name: true } } },
  });
  return rows.map((r) => ({ id: r.group.id, name: r.group.name }));
}

async function viewerGroupIds(viewer: User | null): Promise<string[]> {
  if (!viewer) return [];
  const rows = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, viewer.id),
    columns: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

/** Recipes authored by a user (their personal cookbook). */
export async function listMyRecipes(userId: string) {
  if (!isDbConfigured()) return [];
  return db.query.recipes.findMany({
    where: and(notDeleted, eq(recipes.authorId, userId)),
    orderBy: [desc(recipes.updatedAt)],
    with: { author: true, tags: { with: { tag: true } } },
  });
}

/**
 * Publicly published recipes for the discover feed.
 *
 * `"recent"` keeps the base ordering `publishedAt desc, updatedAt desc`.
 * `"top-rated"` orders by a weighted, owner-excluded rating score computed in
 * SQL over the whole feed (see {@link topRatedOrderBy}), so the simple
 * `offset`/`limit` walks the true global ranking rather than re-sorting a single
 * page. Returns the page plus the offset to fetch next, or `null` once the feed
 * is exhausted.
 */
export async function listPublicRecipes({
  limit = DISCOVER_PAGE_SIZE,
  offset = 0,
  sort = "recent",
}: { limit?: number; offset?: number; sort?: RatingSort } = {}) {
  if (!isDbConfigured()) return { items: [], nextOffset: null };
  const rows = await db.query.recipes.findMany({
    where: and(
      notDeleted,
      eq(recipes.visibility, "public"),
      eq(recipes.status, "published"),
    ),
    orderBy:
      sort === "top-rated"
        ? topRatedOrderBy()
        : [desc(recipes.publishedAt), desc(recipes.updatedAt)],
    limit,
    offset,
    with: { author: true, tags: { with: { tag: true } } },
  });
  return {
    items: rows,
    nextOffset: nextPageOffset(offset, rows.length, limit),
  };
}

/**
 * Map recipe ids to their best-effort detected allergens (issue #431/#432).
 * Pulls just the ingredient `item` text for the given recipes in one batched
 * query and rolls each recipe up with `summarizeAllergens` — the same detector
 * the recipe page uses, so there's no second knowledge base. Recipes with no
 * ingredients (or when the DB is off) simply map to an empty list.
 */
export async function recipeAllergenMap(
  recipeIds: string[],
): Promise<Map<string, Allergen[]>> {
  const result = new Map<string, Allergen[]>();
  const ids = [...new Set(recipeIds)];
  if (ids.length === 0 || !isDbConfigured()) return result;
  const ingredientRows = await db
    .select({
      recipeId: recipeIngredients.recipeId,
      item: recipeIngredients.item,
    })
    .from(recipeIngredients)
    .where(inArray(recipeIngredients.recipeId, ids));
  const itemsByRecipe = new Map<string, string[]>();
  for (const { recipeId, item } of ingredientRows) {
    const list = itemsByRecipe.get(recipeId) ?? [];
    list.push(item);
    itemsByRecipe.set(recipeId, list);
  }
  for (const id of ids) {
    result.set(id, summarizeAllergens(itemsByRecipe.get(id) ?? []));
  }
  return result;
}

/**
 * Attach best-effort detected allergens to card rows for the "safe for my
 * family" badge (#431). Returns the rows widened with an `allergens` field;
 * callers only bother when a family profile with allergies is active.
 */
export async function attachCardAllergens<T extends { id: string }>(
  rows: T[],
): Promise<(T & { allergens: Allergen[] })[]> {
  if (rows.length === 0 || !isDbConfigured()) {
    return rows.map((row) => ({ ...row, allergens: [] }));
  }
  const byRecipe = await recipeAllergenMap(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    allergens: byRecipe.get(row.id) ?? [],
  }));
}

/**
 * Pure visibility predicate shared by every read/write access check. A recipe
 * is viewable when it's public/unlisted, authored by the viewer, or a group
 * recipe the viewer belongs to. Exported so the rule can be unit-tested and
 * reused without re-deriving it.
 */
export function canView(
  recipe: { authorId: string; visibility: string; groupId: string | null },
  viewer: User | null,
  groupIds: string[],
) {
  if (recipe.visibility === "public" || recipe.visibility === "unlisted")
    return true;
  if (recipe.authorId === viewer?.id) return true;
  if (
    recipe.visibility === "group" &&
    recipe.groupId &&
    groupIds.includes(recipe.groupId)
  )
    return true;
  return false;
}

/**
 * Whether `viewer` may see `recipe`, using the same visibility rule as
 * {@link getRecipe}. Exposed so write paths (rating, commenting) can gate on
 * *view* access without re-fetching the whole recipe graph.
 */
export async function canViewRecipe(
  recipe: { authorId: string; visibility: string; groupId: string | null },
  viewer: User | null,
): Promise<boolean> {
  const groupIds = await viewerGroupIds(viewer);
  return canView(recipe, viewer, groupIds);
}

/** Fetch a full recipe by id or slug, enforcing visibility for the viewer. */
export async function getRecipe(idOrSlug: string, viewer: User | null) {
  if (!isDbConfigured()) return null;
  const recipe = await db.query.recipes.findFirst({
    where: and(notDeleted, or(eq(recipes.id, idOrSlug), eq(recipes.slug, idOrSlug))),
    with: {
      author: true,
      group: true,
      ingredients: { orderBy: [recipeIngredients.position] },
      steps: { orderBy: [recipeSteps.position] },
      tags: { with: { tag: true } },
      ratings: true,
    },
  });
  if (!recipe) return null;
  const groupIds = await viewerGroupIds(viewer);
  if (!canView(recipe, viewer, groupIds)) return null;
  return recipe;
}

/** Lightweight existence/ownership check for edit/delete guards. */
export async function getOwnedRecipe(idOrSlug: string, userId: string) {
  if (!isDbConfigured()) return null;
  const recipe = await db.query.recipes.findFirst({
    where: and(
      notDeleted,
      or(eq(recipes.id, idOrSlug), eq(recipes.slug, idOrSlug)),
      eq(recipes.authorId, userId),
    ),
    with: {
      author: true,
      group: true,
      ingredients: { orderBy: [recipeIngredients.position] },
      steps: { orderBy: [recipeSteps.position] },
      tags: { with: { tag: true } },
      ratings: true,
    },
  });
  return recipe ?? null;
}

/** Recipes visible on a viewer's home/library: their own + their groups'. */
export async function listLibrary(
  viewer: User | null,
  sort: RatingSort = "recent",
) {
  if (!isDbConfigured() || !viewer) return [];
  const groupIds = await viewerGroupIds(viewer);
  const scope =
    groupIds.length > 0
      ? or(eq(recipes.authorId, viewer.id), inArray(recipes.groupId, groupIds))
      : eq(recipes.authorId, viewer.id);
  const rows = await db.query.recipes.findMany({
    where: and(notDeleted, scope),
    orderBy: [desc(recipes.updatedAt)],
    with: { author: true, tags: { with: { tag: true } } },
  });
  return applyRatingSort(rows, sort);
}

/**
 * SQL predicate limiting recipes to what a viewer may browse: publicly
 * published, their own, or their groups'. Mirrors the union the browse page
 * shows today (library + discover) so search never widens visibility.
 */
function visibleRecipesScope(viewer: User | null, groupIds: string[]): SQL {
  return and(
    notDeleted,
    or(
      and(eq(recipes.visibility, "public"), eq(recipes.status, "published")),
      viewer ? eq(recipes.authorId, viewer.id) : undefined,
      groupIds.length > 0
        ? and(eq(recipes.visibility, "group"), inArray(recipes.groupId, groupIds))
        : undefined,
    ),
  )!;
}

/** Escape LIKE wildcards so user input like `50%` matches literally. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * OR of the free-text match across a recipe's title, description, cuisine,
 * ingredient item text, and tag names for a single already-escaped `%term%`
 * pattern. Factored out so a query can be matched against several
 * synonym-expanded terms (see {@link expandQueryTerms}).
 */
function recipeMatchesTermSql(like: string): SQL {
  return or(
    ilike(recipes.title, like),
    ilike(recipes.description, like),
    ilike(recipes.cuisine, like),
    exists(
      db
        .select({ one: sql`1` })
        .from(recipeIngredients)
        .where(
          and(
            eq(recipeIngredients.recipeId, recipes.id),
            ilike(recipeIngredients.item, like),
          ),
        ),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(recipeTags)
        .innerJoin(tags, eq(recipeTags.tagId, tags.id))
        .where(
          and(eq(recipeTags.recipeId, recipes.id), ilike(tags.name, like)),
        ),
    ),
  )!;
}

/** ORDER BY clause for a sort option. NULL times/omissions sort last. */
function recipeOrderBy(sort: RecipeSort): SQL[] {
  switch (sort) {
    case "quickest":
      // Postgres sorts NULLs last for ASC, so timeless recipes trail.
      return [asc(recipes.totalMinutes), asc(sql`lower(${recipes.title})`)];
    case "az":
      return [asc(sql`lower(${recipes.title})`)];
    // "top-rated" orders by the SQL weighted score (topRatedOrderBy) in the
    // caller; fall through to the newest base ordering for every other sort.
    case "top-rated":
    case "newest":
    default:
      return [
        desc(sql`coalesce(${recipes.publishedAt}, ${recipes.createdAt})`),
        desc(recipes.createdAt),
      ];
  }
}

const RECIPE_SEARCH_LIMIT = 60;

/**
 * Postgres text-search configuration for recipe search (issue #158). `english`
 * gives us stemming ("tomatoes" matches "tomato") and stop-word removal. Kept as
 * a single constant so the query and the generated `search_vector` column (see
 * the FTS migration) always agree on the dictionary.
 */
const RECIPE_FTS_CONFIG = "english";

/**
 * Does a recipe's full-text `search_vector` match a user query? Uses
 * `websearch_to_tsquery`, which accepts free-form input (quotes, `or`, `-term`)
 * and never throws on syntax, unlike `to_tsquery`. `search_vector` is a
 * generated, GIN-indexed `tsvector` maintained by Postgres (issue #158, added in
 * the FTS migration), so this predicate is index-backed — no per-row seq scan.
 * Referenced by raw column name because the vector is deliberately not mapped in
 * the Drizzle schema (nothing selects it, and keeping it untracked avoids
 * generated-column migration drift).
 */
export function recipeSearchMatchSql(q: string): SQL {
  return sql`"recipes"."search_vector" @@ websearch_to_tsquery('${sql.raw(
    RECIPE_FTS_CONFIG,
  )}', ${q})`;
}

/**
 * Relevance score for a text query, weighted title > description > cuisine (the
 * weights live in the generated column). Only computed over rows that already
 * passed the WHERE match, so it costs nothing on the unmatched majority. Used as
 * the lead ORDER BY term for text searches so the best matches surface first.
 */
export function recipeSearchRankSql(q: string): SQL {
  return sql`ts_rank("recipes"."search_vector", websearch_to_tsquery('${sql.raw(
    RECIPE_FTS_CONFIG,
  )}', ${q}))`;
}

/**
 * The narrowing WHERE conditions for a search — the free-text (synonym-expanded)
 * match plus the cuisine/difficulty/time/tag filters — *excluding* the viewer
 * visibility scope (callers add that). `skip` omits one facet so scoped facet
 * counts can answer "what if I also picked this?" (see {@link listRecipeFacets}).
 */
export function searchFilterConditions(
  search: RecipeSearch,
  opts: { skip?: "cuisine" | "tag" } = {},
): SQL[] {
  const conditions: (SQL | undefined)[] = [];

  if (search.q) {
    // Broaden recall two ways and OR them: Postgres FTS (`search_vector`, with
    // stemming — "tomatoes" finds "tomato") plus a synonym-expanded substring
    // match ("coriander" also finds "cilantro"). Relevance ordering still ranks
    // the literal query first (see relevanceOrderBy).
    const likes = expandQueryTerms(search.q).map(
      (term) => `%${escapeLike(term)}%`,
    );
    conditions.push(
      or(recipeSearchMatchSql(search.q), ...likes.map(recipeMatchesTermSql)),
    );
  }

  if (opts.skip !== "cuisine" && search.cuisines.length > 0)
    conditions.push(or(...search.cuisines.map((c) => ilike(recipes.cuisine, c))));
  if (search.difficulty)
    conditions.push(eq(recipes.difficulty, search.difficulty));
  if (search.maxTime != null)
    conditions.push(lte(recipes.totalMinutes, search.maxTime));

  // Tags narrow conjunctively: a recipe must carry *every* selected tag, so each
  // becomes its own EXISTS. Cuisines above are disjunctive (any-of).
  if (opts.skip !== "tag") {
    for (const tag of search.tags) {
      const slug = tagFilterSlug(tag);
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(recipeTags)
            .innerJoin(tags, eq(recipeTags.tagId, tags.id))
            .where(
              and(
                eq(recipeTags.recipeId, recipes.id),
                or(eq(tags.slug, slug), ilike(tags.name, tag)),
              ),
            ),
        ),
      );
    }
  }

  return conditions.filter((c): c is SQL => c != null);
}

/**
 * Search, filter, and sort recipes a viewer may see. All narrowing runs in SQL
 * against existing indexes; returns [] when the DB is off. Free text is matched
 * with Postgres full-text search over a weighted, GIN-indexed `search_vector`
 * (title > description > cuisine, with stemming) plus trigram-accelerated
 * substring matches on ingredient item text and tag names (issue #158). Text
 * queries are ordered by relevance (`ts_rank`); everything else keeps the
 * requested sort.
 */
export async function searchRecipes(viewer: User | null, search: RecipeSearch) {
  if (!isDbConfigured()) return [];
  const groupIds = await viewerGroupIds(viewer);

  const conditions: (SQL | undefined)[] = [
    visibleRecipesScope(viewer, groupIds),
    ...searchFilterConditions(search),
  ];

  // "Safe for <member>" (#405): resolve the chosen profile (owner-scoped) into
  // the allergens they must avoid and the diets they follow. Diets are declared
  // structurally on the recipe, so they filter in SQL; allergens are detected
  // from ingredient text, so they filter in JS after the rows load.
  let avoidAllergens: Allergen[] = [];
  if (search.safeFor && viewer) {
    const profile = await db.query.memberDietaryProfiles.findFirst({
      where: and(
        eq(memberDietaryProfiles.id, search.safeFor),
        eq(memberDietaryProfiles.userId, viewer.id),
      ),
      columns: { allergens: true, diets: true },
    });
    if (profile) {
      avoidAllergens = (profile.allergens ?? []).filter(isAllergen);
      const requiredDiets = (profile.diets ?? []).filter(isDietaryTag);
      if (requiredDiets.length > 0) {
        conditions.push(arrayContains(recipes.dietaryFlags, requiredDiets));
      }
    }
  }

  const like = search.q ? `%${escapeLike(search.q)}%` : null;

  // "Best match" ranks by the weighted field-match score, but only makes sense
  // with a text query; without one it falls through to the newest ordering.
  const orderBy =
    search.sort === "relevance" && like != null
      ? relevanceOrderBy(like)
      : search.sort === "top-rated"
        ? topRatedOrderBy()
        : search.sort === "popular"
          ? popularOrderBy()
          : recipeOrderBy(search.sort);

  const rows = await db.query.recipes.findMany({
    where: and(...conditions),
    orderBy,
    limit: RECIPE_SEARCH_LIMIT,
    with: {
      author: true,
      tags: { with: { tag: true } },
      ratings: true,
      // Ingredient item text is only needed to explain *why* a text query
      // matched, so it's loaded (and shipped) only when there is a query.
      ...(search.q ? { ingredients: { columns: { item: true } } } : {}),
    },
  });

  // "Safe for <member>" allergen filtering (#405) is best-effort text detection,
  // so it runs in JS: pull the candidate rows' ingredients in one query and drop
  // any recipe that carries an allergen the member must avoid.
  let safeRows = rows;
  if (avoidAllergens.length > 0 && rows.length > 0) {
    const ingredientRows = await db
      .select({
        recipeId: recipeIngredients.recipeId,
        item: recipeIngredients.item,
      })
      .from(recipeIngredients)
      .where(
        inArray(
          recipeIngredients.recipeId,
          rows.map((r) => r.id),
        ),
      );
    const itemsByRecipe = new Map<string, string[]>();
    for (const { recipeId, item } of ingredientRows) {
      const list = itemsByRecipe.get(recipeId) ?? [];
      list.push(item);
      itemsByRecipe.set(recipeId, list);
    }
    safeRows = rows.filter(
      (row) =>
        !hasAllergenConflict(
          avoidAllergens,
          summarizeAllergens(itemsByRecipe.get(row.id) ?? []),
        ),
    );
  }

  // Weighted "best match"/"top-rated" ordering is applied in SQL over the full
  // candidate set above, so the returned rows are already globally ranked. Attach
  // a lightweight match reason per row (and drop the ingredient text from the
  // payload — it was only needed to derive that reason).
  return safeRows.map((row) => {
    const { ingredients, ...rest } = row as typeof row & {
      ingredients?: { item: string }[];
    };
    const matchReason = search.q
      ? deriveMatchReason(
          {
            title: rest.title,
            description: rest.description,
            cuisine: rest.cuisine,
            tags: rest.tags.map((t) => t.tag.name),
            ingredients: (ingredients ?? []).map((i) => i.item),
          },
          search.q,
        )
      : null;
    return { ...rest, matchReason };
  });
}

/** Candidate ceiling scored by "cook with what you have" before ranking. */
const COOK_WITH_CANDIDATE_LIMIT = 200;

/**
 * "Cook with what you have" (#277). Ranks visible recipes by how well the
 * viewer's pantry `items` cover their ingredient list — most matched first, then
 * fewest missing. Candidates are prefiltered in SQL to recipes mentioning at
 * least one pantry item (normalized substring), then scored precisely in JS via
 * `rankByCoverage` (case/plural-normalized, reusing the substitutions matcher).
 * Each result carries a `coverage: { matched, total, missing }` for the
 * "you have 4 of 6" hint.
 */
export async function searchByIngredients(
  viewer: User | null,
  items: string[],
  limit = RECIPE_SEARCH_LIMIT,
) {
  if (!isDbConfigured()) return [];
  const pantry = items.map((i) => i.trim()).filter(Boolean);
  if (pantry.length === 0) return [];

  const groupIds = await viewerGroupIds(viewer);
  const scope = visibleRecipesScope(viewer, groupIds);

  // Cheap prefilter: keep only recipes that mention at least one pantry item, so
  // we don't load ingredient lists for the entire library.
  const mentionsAny = or(
    ...pantry.map((item) =>
      exists(
        db
          .select({ one: sql`1` })
          .from(recipeIngredients)
          .where(
            and(
              eq(recipeIngredients.recipeId, recipes.id),
              ilike(recipeIngredients.item, `%${escapeLike(item)}%`),
            ),
          ),
      ),
    ),
  );

  const rows = await db.query.recipes.findMany({
    where: and(scope, mentionsAny),
    limit: COOK_WITH_CANDIDATE_LIMIT,
    with: {
      author: true,
      tags: { with: { tag: true } },
      ratings: true,
      ingredients: { columns: { item: true } },
    },
  });

  const ranked = rankByCoverage(
    rows.map((recipe) => ({
      recipe,
      ingredients: recipe.ingredients.map((i) => i.item),
    })),
    pantry,
  ).slice(0, limit);

  return ranked.map(({ recipe, coverage }) => {
    const { ingredients: _ingredients, ...card } = recipe;
    return { ...card, coverage };
  });
}

/** Minimum trigram similarity (pg_trgm's default) for a fuzzy suggestion. */
const FUZZY_SIMILARITY_THRESHOLD = 0.3;

/**
 * Typo-tolerant "did you mean" for a text query that returned nothing. Finds the
 * closest visible recipe title or tag name by trigram similarity (the `pg_trgm`
 * index from #158) and returns it as a corrected term to re-search.
 *
 * Degrades gracefully: if the `pg_trgm` extension/`similarity()` isn't installed
 * (zero-config dev), the query throws and we return `null` so the caller simply
 * shows the normal empty state. Returns `null` for short queries or when the
 * best candidate is just the original query.
 */
export async function suggestSearchTerm(
  viewer: User | null,
  query: string,
): Promise<string | null> {
  if (!isDbConfigured()) return null;
  const q = query.trim();
  if (q.length < 3) return null;

  const groupIds = await viewerGroupIds(viewer);
  const scope = visibleRecipesScope(viewer, groupIds);

  try {
    const rows = (await db.execute(sql`
      select term, similarity(term, ${q}) as sim
      from (
        select ${recipes.title} as term
          from ${recipes}
          where ${scope}
        union
        select ${tags.name} as term
          from ${tags}
          join ${recipeTags} on ${recipeTags.tagId} = ${tags.id}
          join ${recipes} on ${recipes.id} = ${recipeTags.recipeId}
          where ${scope}
      ) as candidates
      where similarity(term, ${q}) > ${FUZZY_SIMILARITY_THRESHOLD}
      order by sim desc, term asc
      limit 1
    `)) as unknown as { term: string }[];

    const best = rows[0]?.term?.trim();
    if (!best || best.toLowerCase() === q.toLowerCase()) return null;
    return best;
  } catch {
    // pg_trgm not available (or any DB error) — silently skip the suggestion.
    return null;
  }
}

/**
 * Cuisines + tags present in a viewer's visible recipes, each with a result
 * count scoped to the *other* active filters (the counted facet itself is
 * excluded, so a count answers "how many if I also pick this?"). When `search`
 * is omitted the counts are global. Empty when the DB is off.
 *
 * Any currently-selected facet value is always included — even at count 0 — so
 * the UI can still display and clear it.
 */
export async function listRecipeFacets(
  viewer: User | null,
  search?: RecipeSearch,
): Promise<{
  cuisines: { value: string; count: number }[];
  tags: { slug: string; name: string; count: number }[];
}> {
  if (!isDbConfigured()) return { cuisines: [], tags: [] };
  const groupIds = await viewerGroupIds(viewer);
  const scope = visibleRecipesScope(viewer, groupIds);

  // Count each facet against the active filters minus that same facet.
  const cuisineWhere = and(
    scope,
    ...(search ? searchFilterConditions(search, { skip: "cuisine" }) : []),
    isNotNull(recipes.cuisine),
  );
  const tagRecipeIds = db
    .select({ id: recipes.id })
    .from(recipes)
    .where(
      and(
        scope,
        ...(search ? searchFilterConditions(search, { skip: "tag" }) : []),
      ),
    );

  const [cuisineRows, tagRows] = await Promise.all([
    db
      .select({
        value: recipes.cuisine,
        count: sql<number>`count(*)::int`,
      })
      .from(recipes)
      .where(cuisineWhere)
      .groupBy(recipes.cuisine)
      .orderBy(asc(recipes.cuisine)),
    db
      .select({
        slug: tags.slug,
        name: tags.name,
        count: sql<number>`count(*)::int`,
      })
      .from(tags)
      .innerJoin(recipeTags, eq(recipeTags.tagId, tags.id))
      .where(inArray(recipeTags.recipeId, tagRecipeIds))
      .groupBy(tags.slug, tags.name)
      .orderBy(asc(tags.name)),
  ]);

  const cuisines = cuisineRows
    .filter((r): r is { value: string; count: number } => Boolean(r.value))
    .map((r) => ({ value: r.value, count: r.count }));
  const tags_ = tagRows.map((r) => ({
    slug: r.slug,
    name: r.name,
    count: r.count,
  }));

  // Keep any selected-but-now-zero facet visible so it can be cleared.
  for (const selected of search?.cuisines ?? []) {
    if (!cuisines.some((c) => c.value.toLowerCase() === selected.toLowerCase()))
      cuisines.push({ value: selected, count: 0 });
  }
  for (const selected of search?.tags ?? []) {
    const slug = tagFilterSlug(selected);
    if (!tags_.some((t) => t.slug === slug || t.name.toLowerCase() === selected.toLowerCase()))
      tags_.push({ slug, name: selected, count: 0 });
  }
  cuisines.sort((a, b) => a.value.localeCompare(b.value));
  tags_.sort((a, b) => a.name.localeCompare(b.name));

  return { cuisines, tags: tags_ };
}

/**
 * All visible tags with their visible-recipe counts, for the tag directory.
 * Empty tags (no recipes the viewer can see) are omitted. Ordered by name (A-Z);
 * callers that want a "popular" view can re-sort by count.
 */
export async function listTagsWithCounts(
  viewer: User | null,
): Promise<{ slug: string; name: string; count: number }[]> {
  if (!isDbConfigured()) return [];
  const groupIds = await viewerGroupIds(viewer);
  const scope = visibleRecipesScope(viewer, groupIds);

  const rows = await db
    .select({
      slug: tags.slug,
      name: tags.name,
      count: sql<number>`count(*)::int`,
    })
    .from(tags)
    .innerJoin(recipeTags, eq(recipeTags.tagId, tags.id))
    .innerJoin(recipes, eq(recipes.id, recipeTags.recipeId))
    .where(scope)
    .groupBy(tags.slug, tags.name)
    .orderBy(asc(tags.name));

  return rows.map((r) => ({ slug: r.slug, name: r.name, count: r.count }));
}

/** How many recency-ordered candidates to score before trimming to `limit`. */
const SIMILAR_CANDIDATE_LIMIT = 60;

/**
 * "You might also like" — visible recipes related to `recipeId`, ranked by shared
 * tags, matching cuisine, and ingredient overlap (scoring in `~/lib/related-recipes`).
 * The current recipe is excluded and the result is bounded by `limit`. Candidates
 * are pre-filtered to those sharing a tag or the cuisine so the scan stays cheap.
 */
export async function listSimilarRecipes(
  viewer: User | null,
  recipeId: string,
  limit = 6,
) {
  if (!isDbConfigured()) return [];
  const groupIds = await viewerGroupIds(viewer);
  const scope = visibleRecipesScope(viewer, groupIds);

  const source = await db.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: { id: true, cuisine: true },
    with: {
      tags: { with: { tag: { columns: { slug: true } } } },
      ingredients: { columns: { item: true } },
    },
  });
  if (!source) return [];

  const sourceSignals = {
    tagSlugs: source.tags.map((t) => t.tag.slug),
    cuisine: source.cuisine,
    ingredientTokens: tokenizeIngredients(source.ingredients.map((i) => i.item)),
  };

  const sharesTag = sourceSignals.tagSlugs.length
    ? exists(
        db
          .select({ one: sql`1` })
          .from(recipeTags)
          .innerJoin(tags, eq(recipeTags.tagId, tags.id))
          .where(
            and(
              eq(recipeTags.recipeId, recipes.id),
              inArray(tags.slug, sourceSignals.tagSlugs),
            ),
          ),
      )
    : undefined;
  const sharesCuisine = source.cuisine
    ? ilike(recipes.cuisine, source.cuisine)
    : undefined;
  const related = or(sharesTag, sharesCuisine);
  if (!related) return [];

  const candidates = await db.query.recipes.findMany({
    where: and(scope, related),
    orderBy: desc(recipes.createdAt),
    limit: SIMILAR_CANDIDATE_LIMIT,
    with: {
      author: true,
      tags: { with: { tag: true } },
      ratings: true,
      ingredients: { columns: { item: true } },
    },
  });

  const ranked = rankBySimilarity(
    sourceSignals,
    candidates
      .filter((c) => c.id !== recipeId)
      .map((recipe) => ({
        recipe,
        signals: {
          tagSlugs: recipe.tags.map((t) => t.tag.slug),
          cuisine: recipe.cuisine,
          ingredientTokens: tokenizeIngredients(
            recipe.ingredients.map((i) => i.item),
          ),
        },
      })),
    limit,
  );

  // Ingredient text was only needed for scoring; drop it from the card payload.
  return ranked.map(({ recipe }) => {
    const { ingredients: _ingredients, ...card } = recipe;
    return card;
  });
}

/**
 * Record that `userId` opened `recipeId`, upserting the single (user, recipe) row
 * so re-viewing just bumps `viewedAt`. Safe to call on every detail-page render;
 * a no-op when the database isn't configured.
 */
export async function recordRecipeView(
  userId: string,
  recipeId: string,
): Promise<void> {
  if (!isDbConfigured()) return;
  await db
    .insert(recipeViews)
    .values({ userId, recipeId })
    .onConflictDoUpdate({
      target: [recipeViews.userId, recipeViews.recipeId],
      set: { viewedAt: new Date() },
    });
}

/**
 * The viewer's most-recently-viewed distinct recipes (newest first), for the
 * "Recently viewed" rail. Visibility is re-checked at read time, so a recipe that
 * has since gone private drops out. Returns `[]` for signed-out viewers.
 */
export async function listRecentlyViewed(viewer: User | null, limit = 6) {
  if (!isDbConfigured() || !viewer) return [];
  const groupIds = await viewerGroupIds(viewer);
  const scope = visibleRecipesScope(viewer, groupIds);

  // Pull a few extra ids so any now-invisible recipes can be filtered out
  // without leaving the rail short.
  const recent = await db
    .select({ recipeId: recipeViews.recipeId })
    .from(recipeViews)
    .where(eq(recipeViews.userId, viewer.id))
    .orderBy(desc(recipeViews.viewedAt))
    .limit(limit * 3);
  if (recent.length === 0) return [];

  const order = new Map(recent.map((r, i) => [r.recipeId, i]));
  const rows = await db.query.recipes.findMany({
    where: and(
      scope,
      inArray(
        recipes.id,
        recent.map((r) => r.recipeId),
      ),
    ),
    with: { author: true, tags: { with: { tag: true } }, ratings: true },
  });

  return rows
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .slice(0, limit);
}

/**
 * Validate a persisted version snapshot before using it.
 *
 * `recipe_versions.snapshot` is `jsonb`, so Drizzle hands back an already-parsed
 * value — `jsonb` guarantees valid JSON but not a valid *shape*, so we still run
 * it through the Zod `recipeInput` schema. A string is JSON-parsed defensively
 * so any legacy/text snapshot that slips through never crashes a caller.
 */
export function parseSnapshot(snapshot: unknown): RecipeInput | null {
  let value: unknown = snapshot;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const parsed = recipeInput.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * A page of a recipe's saved versions, newest first (#159). Keyset-paginated on
 * the monotonic `versionNumber` and — crucially — excludes the heavy `snapshot`
 * jsonb blob, which the history list never renders (only a version *preview*
 * needs it, via {@link getRecipeVersion}). Pass the previous page's
 * `nextCursor` as `beforeVersion` to walk further back into the history.
 */
export async function getRecipeVersions(
  recipeId: string,
  options: { beforeVersion?: number | null; limit?: number } = {},
) {
  const limit = clampPageSize(options.limit, VERSION_HISTORY_PAGE_SIZE);
  const rows = isDbConfigured()
    ? await db.query.recipeVersions.findMany({
        where: and(
          eq(recipeVersions.recipeId, recipeId),
          options.beforeVersion != null
            ? lt(recipeVersions.versionNumber, options.beforeVersion)
            : undefined,
        ),
        orderBy: [desc(recipeVersions.versionNumber)],
        // Omit the snapshot jsonb from list rows — it can be large and the
        // history list only needs metadata (label, author, timestamp).
        columns: { snapshot: false },
        with: {
          author: {
            columns: { id: true, name: true, handle: true, avatarUrl: true },
          },
        },
        // Over-fetch one row to detect whether a further page exists.
        limit: limit + 1,
      })
    : [];
  return toCursorPage(rows, limit, (row) => row.versionNumber);
}

/** A single saved recipe version, usually for previewing a snapshot. */
export async function getRecipeVersion(
  recipeId: string,
  versionNumber: number,
) {
  if (!isDbConfigured()) return null;
  return (
    (await db.query.recipeVersions.findFirst({
      where: and(
        eq(recipeVersions.recipeId, recipeId),
        eq(recipeVersions.versionNumber, versionNumber),
      ),
      with: {
        author: {
          columns: { id: true, name: true, handle: true, avatarUrl: true },
        },
      },
    })) ?? null
  );
}

/**
 * Parent recipe plus recipes adapted from this one, scoped to what `viewer`
 * may see. Forks start life private, so the adaptations list is filtered with
 * the same {@link canView} rule as {@link getRecipe}: an anonymous viewer only
 * sees public/unlisted forks, never someone else's private or group draft.
 */
export async function getRecipeLineage(recipeId: string, viewer: User | null) {
  if (!isDbConfigured()) return { parent: null, adaptations: [] };

  const recipe = await db.query.recipes.findFirst({
    where: and(notDeleted, eq(recipes.id, recipeId)),
    columns: { forkedFromId: true },
  });

  const parent = recipe?.forkedFromId
    ? ((await db.query.recipes.findFirst({
        where: and(notDeleted, eq(recipes.id, recipe.forkedFromId)),
        columns: { id: true, slug: true, title: true },
        with: { author: { columns: { name: true } } },
      })) ?? null)
    : null;

  const groupIds = await viewerGroupIds(viewer);
  const forks = await db.query.recipes.findMany({
    where: and(notDeleted, eq(recipes.forkedFromId, recipeId)),
    orderBy: [desc(recipes.updatedAt)],
    columns: {
      id: true,
      slug: true,
      title: true,
      visibility: true,
      authorId: true,
      groupId: true,
    },
    with: { author: { columns: { name: true } } },
    // Bound the fan-out: a wildly-forked recipe can't load unlimited children
    // into one lineage read (#159). The most recently touched forks win.
    limit: FORK_LIST_CAP,
  });
  // Hide forks the viewer isn't allowed to see so a public recipe never lists
  // another member's private (or out-of-group) adaptation.
  const adaptations = forks.filter((fork) => canView(fork, viewer, groupIds));

  return { parent, adaptations };
}

export type RecipeTimeline = Awaited<ReturnType<typeof getRecipeTimeline>>;

/**
 * Opaque keyset cursor into a recipe's timeline events: the `(createdAt, id)`
 * of the last event on a page. Callers pass it back as `afterEvent` to fetch
 * the next, older-to-newer slice of history (#159).
 */
export type TimelineCursor = { createdAt: Date; id: string };

/**
 * Assemble a recipe's family-history timeline: its own milestones (created,
 * edited, published) plus each fork it originates and, if it is itself an
 * adaptation, a link back to the recipe it came from — all in chronological
 * order with authors and dates. Falls back to synthesising milestones from the
 * recipe + lineage rows so recipes predating the events log still read well.
 *
 * Descendant-fork entries (and their fork notes) are gated with {@link canView}
 * for `viewer`, so a public recipe's timeline never leaks a private adaptation.
 *
 * Events are keyset-paginated oldest-first (#159): the first page begins the
 * story and folds in the (bounded) descendant forks plus any synthetic origin;
 * pass the returned `nextCursor` as `afterEvent` to read newer events. Later
 * pages carry events only — the origin back-fill and fork side-list belong to
 * the story's opening page, never a continuation.
 */
export async function getRecipeTimeline(
  recipeId: string,
  viewer: User | null,
  options: { afterEvent?: TimelineCursor | null; limit?: number } = {},
): Promise<{
  entries: TimelineEntry[];
  parent: { slug: string; title: string; author?: { name: string | null } | null } | null;
  nextCursor: TimelineCursor | null;
}> {
  if (!isDbConfigured())
    return { entries: [], parent: null, nextCursor: null };

  const recipe = await db.query.recipes.findFirst({
    where: and(notDeleted, eq(recipes.id, recipeId)),
    columns: { id: true, forkedFromId: true, createdAt: true },
  });
  if (!recipe) return { entries: [], parent: null, nextCursor: null };

  const groupIds = await viewerGroupIds(viewer);
  const isFirstPage = options.afterEvent == null;
  const eventLimit = clampPageSize(options.limit, TIMELINE_EVENT_PAGE_SIZE);
  const cursor = options.afterEvent ?? null;

  const [eventRows, children, parentRecipe] = await Promise.all([
    db.query.recipeEvents.findMany({
      where: and(
        eq(recipeEvents.recipeId, recipeId),
        // Keyset seek past the last event on the previous page, ordered by the
        // same (createdAt, id) tuple we sort by so ties never skip a row.
        cursor
          ? or(
              gt(recipeEvents.createdAt, cursor.createdAt),
              and(
                eq(recipeEvents.createdAt, cursor.createdAt),
                gt(recipeEvents.id, cursor.id),
              ),
            )
          : undefined,
      ),
      orderBy: [asc(recipeEvents.createdAt), asc(recipeEvents.id)],
      with: {
        actor: { columns: { name: true, handle: true, avatarUrl: true } },
        related: {
          columns: {
            slug: true,
            title: true,
            authorId: true,
            visibility: true,
            groupId: true,
          },
        },
      },
      // Over-fetch one row to detect a further page of events.
      limit: eventLimit + 1,
    }),
    // Descendant forks are a bounded side-list that belongs to the opening page
    // only, so continuations don't re-emit them (#159).
    isFirstPage
      ? db.query.recipes.findMany({
          where: and(notDeleted, eq(recipes.forkedFromId, recipeId)),
          orderBy: [asc(recipes.createdAt)],
          columns: {
            id: true,
            slug: true,
            title: true,
            createdAt: true,
            authorId: true,
            visibility: true,
            groupId: true,
          },
          with: {
            author: { columns: { name: true, handle: true, avatarUrl: true } },
          },
          limit: FORK_LIST_CAP,
        })
      : Promise.resolve([]),
    recipe.forkedFromId
      ? db.query.recipes.findFirst({
          where: and(notDeleted, eq(recipes.id, recipe.forkedFromId)),
          columns: { id: true, slug: true, title: true, createdAt: true },
          with: {
            author: { columns: { name: true, handle: true, avatarUrl: true } },
          },
        })
      : Promise.resolve(undefined),
  ]);

  // Trim the over-fetched sentinel row and derive the cursor to the next page
  // of events (the last kept event's key), or null when history is exhausted.
  const events = eventRows.slice(0, eventLimit);
  const lastEvent = events[events.length - 1];
  const nextCursor =
    eventRows.length > eventLimit && lastEvent
      ? { createdAt: lastEvent.createdAt, id: lastEvent.id }
      : null;

  // Only surface descendant forks the viewer may see; a private adaptation (and
  // its fork note) must stay hidden on a public recipe's timeline.
  const visibleChildren = children.filter((child) =>
    canView(child, viewer, groupIds),
  );

  const entries: TimelineEntry[] = [];
  for (const event of events) {
    // A source-side `adapted` event points forward to a descendant fork.
    const isForwardFork =
      event.type === "adapted" &&
      event.relatedRecipeId != null &&
      event.relatedRecipeId !== recipe.forkedFromId;
    // Drop forward-fork entries (title, slug, and the forker's note) when the
    // viewer isn't allowed to see the fork they point at.
    if (
      isForwardFork &&
      !(event.related && canView(event.related, viewer, groupIds))
    ) {
      continue;
    }
    entries.push({
      id: event.id,
      kind: isForwardFork ? "adaptation" : event.type,
      note: event.note,
      createdAt: event.createdAt,
      actor: event.actor ?? null,
      related: event.related
        ? { slug: event.related.slug, title: event.related.title }
        : null,
    });
  }

  // Back-fill for recipes created before the events log existed. Only the
  // opening page can begin the story, so a continuation never invents an
  // origin milestone the earlier page already showed (#159).
  const hasOrigin = entries.some(
    (e) => e.kind === "created" || e.kind === "adapted",
  );
  if (isFirstPage && !hasOrigin) {
    entries.push({
      id: `synth-origin-${recipe.id}`,
      kind: parentRecipe ? "adapted" : "created",
      note: null,
      createdAt: recipe.createdAt,
      actor: parentRecipe?.author ?? null,
      related: parentRecipe
        ? { slug: parentRecipe.slug, title: parentRecipe.title }
        : null,
    });
  }
  const linkedChildIds = new Set(
    entries
      .filter((e) => e.kind === "adaptation" && e.related)
      .map((e) => e.related!.slug),
  );
  for (const child of visibleChildren) {
    if (linkedChildIds.has(child.slug)) continue;
    entries.push({
      id: `synth-child-${child.id}`,
      kind: "adaptation",
      note: null,
      createdAt: child.createdAt,
      actor: child.author ?? null,
      related: { slug: child.slug, title: child.title },
    });
  }

  return {
    entries: assembleTimeline(entries),
    parent: parentRecipe
      ? {
          slug: parentRecipe.slug,
          title: parentRecipe.title,
          author: parentRecipe.author,
        }
      : null,
    nextCursor,
  };
}
