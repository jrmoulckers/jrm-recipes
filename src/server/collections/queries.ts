import "server-only";

import { and, asc, desc, eq, or } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  collectionRecipes,
  collections,
  favorites,
  groupMembers,
  type User,
} from "~/server/db/schema";
import { canView } from "~/server/recipes/queries";

const recipeCardWith = {
  author: true,
  tags: { with: { tag: true } },
  ratings: true,
} as const;

/** Group ids the viewer belongs to — for per-recipe visibility scoping. */
async function viewerGroupIds(viewer: User | null): Promise<string[]> {
  if (!viewer) return [];
  const rows = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, viewer.id),
    columns: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

export type CollectionSummary = Awaited<
  ReturnType<typeof listMyCollections>
>[number];
export type FavoriteRecipe = Awaited<
  ReturnType<typeof listMyFavorites>
>[number];
export type FullCollection = NonNullable<
  Awaited<ReturnType<typeof getCollection>>
>;
export type CollectionMembership = Awaited<
  ReturnType<typeof getCollectionsForRecipe>
>[number];

/** The user's collections, newest first, with a recipe count + cover fallback. */
export async function listMyCollections(userId: string) {
  if (!isDbConfigured()) return [];

  const rows = await db.query.collections.findMany({
    where: eq(collections.userId, userId),
    orderBy: [desc(collections.updatedAt)],
    with: {
      recipes: {
        columns: { recipeId: true },
        orderBy: [asc(collectionRecipes.position), asc(collectionRecipes.addedAt)],
        with: { recipe: { columns: { coverImageUrl: true } } },
      },
    },
  });

  return rows.map((collection) => {
    const cover =
      collection.coverImageUrl ??
      collection.recipes.find((r) => r.recipe?.coverImageUrl)?.recipe
        ?.coverImageUrl ??
      null;
    return {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      coverImageUrl: cover,
      recipeCount: collection.recipes.length,
      updatedAt: collection.updatedAt,
    };
  });
}

/** A single collection the viewer owns, with its recipes in saved order. */
export async function getCollection(id: string, viewer: User | null) {
  if (!isDbConfigured() || !viewer) return null;

  const collection = await db.query.collections.findFirst({
    where: and(eq(collections.id, id), eq(collections.userId, viewer.id)),
    with: {
      recipes: {
        orderBy: [asc(collectionRecipes.position), asc(collectionRecipes.addedAt)],
        with: { recipe: { with: recipeCardWith } },
      },
    },
  });
  if (!collection) return null;

  const recipes = collection.recipes
    .map((entry) => entry.recipe)
    .filter((recipe): recipe is NonNullable<typeof recipe> => recipe != null);

  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    coverImageUrl: collection.coverImageUrl,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    recipes,
  };
}

/**
 * Fetch a collection by its id *or* share token, enforcing collection-level
 * visibility for the viewer:
 *  - the owner always sees it (any visibility);
 *  - `public` collections are visible to anyone;
 *  - `unlisted` collections are visible only when reached via their share token.
 *
 * Recipes inside are additionally filtered by each recipe's own visibility, so a
 * shared cookbook never leaks a private recipe. Returns `null` when missing or
 * forbidden (callers should `notFound()`).
 */
export async function getSharedCollection(
  idOrToken: string,
  viewer: User | null,
) {
  if (!isDbConfigured()) return null;

  const collection = await db.query.collections.findFirst({
    where: or(
      eq(collections.id, idOrToken),
      eq(collections.shareToken, idOrToken),
    ),
    with: {
      owner: { columns: { id: true, name: true } },
      recipes: {
        orderBy: [asc(collectionRecipes.position), asc(collectionRecipes.addedAt)],
        with: { recipe: { with: recipeCardWith } },
      },
    },
  });
  if (!collection) return null;

  const isOwner = viewer?.id === collection.userId;
  const matchedByToken =
    collection.shareToken != null && collection.shareToken === idOrToken;
  const permitted =
    isOwner ||
    collection.visibility === "public" ||
    (collection.visibility === "unlisted" && matchedByToken);
  if (!permitted) return null;

  const groupIds = await viewerGroupIds(viewer);
  const recipes = collection.recipes
    .map((entry) => entry.recipe)
    .filter((recipe): recipe is NonNullable<typeof recipe> => recipe != null)
    .filter((recipe) => canView(recipe, viewer, groupIds));

  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    coverImageUrl: collection.coverImageUrl,
    visibility: collection.visibility,
    shareToken: collection.shareToken,
    isOwner,
    ownerName: collection.owner?.name ?? null,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    recipes,
  };
}

/** Whether a recipe is in the user's favorites. */
export async function isFavorited(
  recipeId: string,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!isDbConfigured() || !userId) return false;
  const row = await db.query.favorites.findFirst({
    where: and(eq(favorites.userId, userId), eq(favorites.recipeId, recipeId)),
    columns: { id: true },
  });
  return Boolean(row);
}

/** The set of recipe ids the user has favorited (to mark cards in a list). */
export async function getFavoriteRecipeIds(
  userId: string | null | undefined,
): Promise<Set<string>> {
  if (!isDbConfigured() || !userId) return new Set();
  const rows = await db.query.favorites.findMany({
    where: eq(favorites.userId, userId),
    columns: { recipeId: true },
  });
  return new Set(rows.map((r) => r.recipeId));
}

/** The user's favorited recipes, most recently saved first. */
export async function listMyFavorites(userId: string) {
  if (!isDbConfigured()) return [];
  const rows = await db.query.favorites.findMany({
    where: eq(favorites.userId, userId),
    orderBy: [desc(favorites.createdAt)],
    with: { recipe: { with: recipeCardWith } },
  });
  return rows
    .map((row) => row.recipe)
    .filter((recipe): recipe is NonNullable<typeof recipe> => recipe != null);
}

/**
 * The user's collections annotated with whether each already contains `recipeId`
 * — powers the "Save to collection" picker.
 */
export async function getCollectionsForRecipe(userId: string, recipeId: string) {
  if (!isDbConfigured()) return [];
  const rows = await db.query.collections.findMany({
    where: eq(collections.userId, userId),
    orderBy: [desc(collections.updatedAt)],
    columns: { id: true, name: true },
    with: {
      recipes: {
        where: eq(collectionRecipes.recipeId, recipeId),
        columns: { id: true },
      },
    },
  });
  return rows.map((collection) => ({
    id: collection.id,
    name: collection.name,
    contains: collection.recipes.length > 0,
  }));
}
