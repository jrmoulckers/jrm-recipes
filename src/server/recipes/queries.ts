import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  compareByTopRated,
  ratingSummary,
  type RatingSort,
} from "~/lib/ratings";
import {
  groupMembers,
  recipeIngredients,
  recipeSteps,
  recipeVersions,
  recipes,
  type User,
} from "~/server/db/schema";
import { recipeInput, type RecipeInput } from "./validation";
import { DISCOVER_PAGE_SIZE, nextPageOffset } from "./pagination";

/** Recipe with everything needed to render a detail page. */
export type FullRecipe = NonNullable<Awaited<ReturnType<typeof getRecipe>>>;
export type RecipeListItem = Awaited<ReturnType<typeof listMyRecipes>>[number];
export type PublicRecipeListItem = Awaited<
  ReturnType<typeof listPublicRecipes>
>["items"][number];
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

function canView(
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

/** Parent recipe plus recipes adapted from this one. */
export async function getRecipeLineage(recipeId: string) {
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

  const adaptations = await db.query.recipes.findMany({
    where: eq(recipes.forkedFromId, recipeId),
    orderBy: [desc(recipes.updatedAt)],
    columns: { id: true, slug: true, title: true, visibility: true },
    with: { author: { columns: { name: true } } },
  });

  return { parent, adaptations };
}
