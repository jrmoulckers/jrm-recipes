import "server-only";

import {
  and,
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
import {
  groupMembers,
  recipeEvents,
  recipeIngredients,
  recipeSteps,
  recipeTags,
  recipeVersions,
  recipes,
  tags,
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
  ];

  if (search.q) {
    const like = `%${escapeLike(search.q)}%`;
    conditions.push(
      or(
        recipeSearchMatchSql(search.q),
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
              and(
                eq(recipeTags.recipeId, recipes.id),
                ilike(tags.name, like),
              ),
            ),
        ),
      ),
    );
  }

  if (search.cuisine) conditions.push(ilike(recipes.cuisine, search.cuisine));
  if (search.difficulty)
    conditions.push(eq(recipes.difficulty, search.difficulty));
  if (search.maxTime != null)
    conditions.push(lte(recipes.totalMinutes, search.maxTime));

  if (search.tag) {
    const slug = tagFilterSlug(search.tag);
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(recipeTags)
          .innerJoin(tags, eq(recipeTags.tagId, tags.id))
          .where(
            and(
              eq(recipeTags.recipeId, recipes.id),
              or(eq(tags.slug, slug), ilike(tags.name, search.tag)),
            ),
          ),
      ),
    );
  }

  const baseOrder =
    search.sort === "top-rated"
      ? topRatedOrderBy()
      : recipeOrderBy(search.sort);
  // For a text query, relevance leads: best full-text matches first, with the
  // requested sort as the tie-breaker (and as the sole order for empty `q`).
  // Ingredient-/tag-only matches score 0 on the vector, so they trail the
  // title/description/cuisine hits but still appear.
  const orderBy = search.q
    ? [desc(recipeSearchRankSql(search.q)), ...baseOrder]
    : baseOrder;

  const rows = await db.query.recipes.findMany({
    where: and(...conditions),
    orderBy,
    limit: RECIPE_SEARCH_LIMIT,
    with: { author: true, tags: { with: { tag: true } } },
  });

  // "top-rated" ordering (weighted, owner-excluded) is applied in SQL over the
  // full candidate set above, so the returned rows are already globally ranked.
  return rows;
}

/**
 * Distinct cuisines + tags present in a viewer's visible recipes, used to
 * populate the filter menus. Empty when the DB is off.
 */
export async function listRecipeFacets(
  viewer: User | null,
): Promise<{ cuisines: string[]; tags: { slug: string; name: string }[] }> {
  if (!isDbConfigured()) return { cuisines: [], tags: [] };
  const groupIds = await viewerGroupIds(viewer);
  const scope = visibleRecipesScope(viewer, groupIds);

  const [cuisineRows, tagRows] = await Promise.all([
    db
      .selectDistinct({ cuisine: recipes.cuisine })
      .from(recipes)
      .where(and(scope, isNotNull(recipes.cuisine)))
      .orderBy(asc(recipes.cuisine)),
    db
      .selectDistinct({ slug: tags.slug, name: tags.name })
      .from(tags)
      .innerJoin(recipeTags, eq(recipeTags.tagId, tags.id))
      .innerJoin(recipes, eq(recipes.id, recipeTags.recipeId))
      .where(scope)
      .orderBy(asc(tags.name)),
  ]);

  return {
    cuisines: cuisineRows
      .map((r) => r.cuisine)
      .filter((c): c is string => Boolean(c)),
    tags: tagRows,
  };
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
