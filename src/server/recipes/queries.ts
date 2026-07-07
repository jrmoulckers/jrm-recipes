import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  compareByTopRated,
  ratingSummary,
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
import { DISCOVER_PAGE_SIZE, nextPageOffset } from "./pagination";
import {
  tagFilterSlug,
  type RecipeSearch,
  type RecipeSort,
} from "./search";
import { assembleTimeline, type TimelineEntry } from "./timeline";

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
export type VersionListItem = Awaited<
  ReturnType<typeof getRecipeVersions>
>[number];

/** Re-exported for recipe detail pages that import it from the query module. */
export { ratingSummary };

/**
 * Re-order a fetched list so the highest-rated recipes come first. Ordering by
 * an aggregate of the related `ratings` rows is awkward in the relational query
 * builder, so we sort the loaded window in memory (the lists already eager-load
 * `ratings`). `"recent"` keeps the DB order untouched.
 */
function applyRatingSort<T extends { ratings: { value: number }[] }>(
  rows: T[],
  sort: RatingSort,
): T[] {
  if (sort !== "top-rated") return rows;
  return [...rows].sort((a, b) =>
    compareByTopRated(ratingSummary(a.ratings), ratingSummary(b.ratings)),
  );
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
    where: eq(recipes.authorId, userId),
    orderBy: [desc(recipes.updatedAt)],
    with: { author: true, tags: { with: { tag: true } }, ratings: true },
  });
}

/**
 * Publicly published recipes, newest first (the discover feed).
 *
 * Paginated via a simple offset so the base ordering stays exactly
 * `publishedAt desc, updatedAt desc`; an optional `sort` (e.g. "top-rated")
 * re-orders the fetched page in memory. Returns the page plus the offset to
 * fetch next, or `null` once the feed is exhausted.
 */
export async function listPublicRecipes({
  limit = DISCOVER_PAGE_SIZE,
  offset = 0,
  sort = "recent",
}: { limit?: number; offset?: number; sort?: RatingSort } = {}) {
  if (!isDbConfigured()) return { items: [], nextOffset: null };
  const rows = await db.query.recipes.findMany({
    where: and(
      eq(recipes.visibility, "public"),
      eq(recipes.status, "published"),
    ),
    orderBy: [desc(recipes.publishedAt), desc(recipes.updatedAt)],
    limit,
    offset,
    with: { author: true, tags: { with: { tag: true } }, ratings: true },
  });
  return {
    items: applyRatingSort(rows, sort),
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
    where: or(eq(recipes.id, idOrSlug), eq(recipes.slug, idOrSlug)),
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
    where: scope,
    orderBy: [desc(recipes.updatedAt)],
    with: { author: true, tags: { with: { tag: true } }, ratings: true },
  });
  return applyRatingSort(rows, sort);
}

/**
 * SQL predicate limiting recipes to what a viewer may browse: publicly
 * published, their own, or their groups'. Mirrors the union the browse page
 * shows today (library + discover) so search never widens visibility.
 */
function visibleRecipesScope(viewer: User | null, groupIds: string[]): SQL {
  return or(
    and(eq(recipes.visibility, "public"), eq(recipes.status, "published")),
    viewer ? eq(recipes.authorId, viewer.id) : undefined,
    groupIds.length > 0
      ? and(eq(recipes.visibility, "group"), inArray(recipes.groupId, groupIds))
      : undefined,
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
    // "top-rated" is re-sorted in-memory (applyRatingSort); use the newest
    // base ordering for the SQL fetch.
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
 * Search, filter, and sort recipes a viewer may see. All narrowing runs in SQL
 * against existing indexes; returns [] when the DB is off. The free-text query
 * matches title, description, cuisine, tag names, and ingredient item text.
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

  const rows = await db.query.recipes.findMany({
    where: and(...conditions),
    orderBy: recipeOrderBy(search.sort),
    limit: RECIPE_SEARCH_LIMIT,
    with: { author: true, tags: { with: { tag: true } }, ratings: true },
  });

  // "top-rated" ordering is owned by the ratings module; reuse its comparator
  // in-memory so both sort systems stay consistent across the app.
  return applyRatingSort(
    rows,
    search.sort === "top-rated" ? "top-rated" : "recent",
  );
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

/** Validate a persisted version snapshot before using it. */
export function parseSnapshot(snapshot: string): RecipeInput | null {
  try {
    const parsed = recipeInput.safeParse(JSON.parse(snapshot) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Version history for a recipe, newest first. */
export async function getRecipeVersions(recipeId: string) {
  if (!isDbConfigured()) return [];
  return db.query.recipeVersions.findMany({
    where: eq(recipeVersions.recipeId, recipeId),
    orderBy: [desc(recipeVersions.versionNumber)],
    with: {
      author: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
    },
  });
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
    where: eq(recipes.id, recipeId),
    columns: { forkedFromId: true },
  });

  const parent = recipe?.forkedFromId
    ? ((await db.query.recipes.findFirst({
        where: eq(recipes.id, recipe.forkedFromId),
        columns: { id: true, slug: true, title: true },
        with: { author: { columns: { name: true } } },
      })) ?? null)
    : null;

  const groupIds = await viewerGroupIds(viewer);
  const forks = await db.query.recipes.findMany({
    where: eq(recipes.forkedFromId, recipeId),
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
  });
  // Hide forks the viewer isn't allowed to see so a public recipe never lists
  // another member's private (or out-of-group) adaptation.
  const adaptations = forks.filter((fork) => canView(fork, viewer, groupIds));

  return { parent, adaptations };
}

export type RecipeTimeline = Awaited<ReturnType<typeof getRecipeTimeline>>;

/**
 * Assemble a recipe's family-history timeline: its own milestones (created,
 * edited, published) plus each fork it originates and, if it is itself an
 * adaptation, a link back to the recipe it came from — all in chronological
 * order with authors and dates. Falls back to synthesising milestones from the
 * recipe + lineage rows so recipes predating the events log still read well.
 *
 * Descendant-fork entries (and their fork notes) are gated with {@link canView}
 * for `viewer`, so a public recipe's timeline never leaks a private adaptation.
 */
export async function getRecipeTimeline(
  recipeId: string,
  viewer: User | null,
): Promise<{
  entries: TimelineEntry[];
  parent: { slug: string; title: string; author?: { name: string | null } | null } | null;
}> {
  if (!isDbConfigured()) return { entries: [], parent: null };

  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: { id: true, forkedFromId: true, createdAt: true },
  });
  if (!recipe) return { entries: [], parent: null };

  const groupIds = await viewerGroupIds(viewer);

  const [events, children, parentRecipe] = await Promise.all([
    db.query.recipeEvents.findMany({
      where: eq(recipeEvents.recipeId, recipeId),
      orderBy: [asc(recipeEvents.createdAt)],
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
    }),
    db.query.recipes.findMany({
      where: eq(recipes.forkedFromId, recipeId),
      columns: {
        id: true,
        slug: true,
        title: true,
        createdAt: true,
        authorId: true,
        visibility: true,
        groupId: true,
      },
      with: { author: { columns: { name: true, handle: true, avatarUrl: true } } },
    }),
    recipe.forkedFromId
      ? db.query.recipes.findFirst({
          where: eq(recipes.id, recipe.forkedFromId),
          columns: { id: true, slug: true, title: true, createdAt: true },
          with: {
            author: { columns: { name: true, handle: true, avatarUrl: true } },
          },
        })
      : Promise.resolve(undefined),
  ]);

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

  // Back-fill for recipes created before the events log existed.
  const hasOrigin = entries.some(
    (e) => e.kind === "created" || e.kind === "adapted",
  );
  if (!hasOrigin) {
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
  };
}
