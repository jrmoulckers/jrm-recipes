import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

import { db } from "~/server/db";
import {
  collectionRecipes,
  collections,
  favorites,
  groupMembers,
  recipes,
  type User,
} from "~/server/db/schema";
import {
  type CollectionInput,
  type CollectionVisibilityValue,
} from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function viewerGroupIds(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    columns: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

/** Mirror of the recipe visibility rules — can this user see this recipe? */
function canView(
  recipe: { authorId: string; visibility: string; groupId: string | null },
  viewer: User,
  groupIds: string[],
): boolean {
  if (recipe.visibility === "public" || recipe.visibility === "unlisted")
    return true;
  if (recipe.authorId === viewer.id) return true;
  return (
    recipe.visibility === "group" &&
    recipe.groupId != null &&
    groupIds.includes(recipe.groupId)
  );
}

/** Load a recipe the viewer is allowed to save, or throw NOT_FOUND. */
async function requireViewableRecipe(tx: Tx, recipeId: string, viewer: User) {
  const recipe = await tx.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: { id: true, authorId: true, visibility: true, groupId: true },
  });
  if (!recipe) throw new Error("NOT_FOUND");

  const groupIds =
    recipe.visibility === "group" ? await viewerGroupIds(tx, viewer.id) : [];
  if (!canView(recipe, viewer, groupIds)) throw new Error("NOT_FOUND");
  return recipe;
}

async function requireOwnedCollection(
  tx: Tx,
  collectionId: string,
  user: User,
) {
  const collection = await tx.query.collections.findFirst({
    where: and(
      eq(collections.id, collectionId),
      eq(collections.userId, user.id),
    ),
    columns: { id: true },
  });
  if (!collection) throw new Error("NOT_FOUND");
  return collection;
}

function collectionFields(input: CollectionInput) {
  return {
    name: input.name,
    description: input.description ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
  };
}

/** Add or remove a favorite. Returns the resulting favorited state. */
export async function toggleFavorite(
  recipeId: string,
  user: User,
): Promise<{ favorited: boolean }> {
  return db.transaction(async (tx) => {
    await requireViewableRecipe(tx, recipeId, user);

    const existing = await tx.query.favorites.findFirst({
      where: and(
        eq(favorites.userId, user.id),
        eq(favorites.recipeId, recipeId),
      ),
      columns: { id: true },
    });

    if (existing) {
      await tx.delete(favorites).where(eq(favorites.id, existing.id));
      return { favorited: false };
    }

    await tx
      .insert(favorites)
      .values({ userId: user.id, recipeId })
      .onConflictDoNothing({
        target: [favorites.userId, favorites.recipeId],
      });
    return { favorited: true };
  });
}

export async function createCollection(input: CollectionInput, user: User) {
  const [row] = await db
    .insert(collections)
    .values({ ...collectionFields(input), userId: user.id })
    .returning({ id: collections.id, name: collections.name });
  if (!row) throw new Error("CONFLICT");
  return row;
}

export async function renameCollection(
  id: string,
  input: CollectionInput,
  user: User,
) {
  const [row] = await db
    .update(collections)
    .set(collectionFields(input))
    .where(and(eq(collections.id, id), eq(collections.userId, user.id)))
    .returning({ id: collections.id, name: collections.name });
  if (!row) throw new Error("NOT_FOUND");
  return row;
}

export async function deleteCollection(id: string, user: User) {
  const [row] = await db
    .delete(collections)
    .where(and(eq(collections.id, id), eq(collections.userId, user.id)))
    .returning({ id: collections.id });
  if (!row) throw new Error("NOT_FOUND");
  return row;
}

/**
 * Change a collection's visibility. Minting an unguessable `shareToken` the
 * first time it leaves `private`, and reusing it afterwards so a shared link
 * stays stable even if the owner toggles back and forth.
 */
export async function setCollectionVisibility(
  id: string,
  visibility: CollectionVisibilityValue,
  user: User,
) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.collections.findFirst({
      where: and(eq(collections.id, id), eq(collections.userId, user.id)),
      columns: { id: true, shareToken: true },
    });
    if (!existing) throw new Error("NOT_FOUND");

    const shareToken =
      visibility !== "private" && !existing.shareToken
        ? createId()
        : existing.shareToken;

    const [row] = await tx
      .update(collections)
      .set({ visibility, shareToken, updatedAt: new Date() })
      .where(and(eq(collections.id, id), eq(collections.userId, user.id)))
      .returning({
        id: collections.id,
        visibility: collections.visibility,
        shareToken: collections.shareToken,
      });
    if (!row) throw new Error("NOT_FOUND");
    return row;
  });
}

export async function addRecipeToCollection(
  collectionId: string,
  recipeId: string,
  user: User,
) {
  return db.transaction(async (tx) => {
    await requireOwnedCollection(tx, collectionId, user);
    await requireViewableRecipe(tx, recipeId, user);

    const [{ next } = { next: 0 }] = await tx
      .select({
        next: sql<number>`coalesce(max(${collectionRecipes.position}), -1) + 1`,
      })
      .from(collectionRecipes)
      .where(eq(collectionRecipes.collectionId, collectionId));

    await tx
      .insert(collectionRecipes)
      .values({ collectionId, recipeId, position: next })
      .onConflictDoNothing({
        target: [collectionRecipes.collectionId, collectionRecipes.recipeId],
      });

    // Touch the collection so "recently updated" ordering reflects the change.
    await tx
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(eq(collections.id, collectionId));

    return { collectionId, recipeId };
  });
}

export async function removeRecipeFromCollection(
  collectionId: string,
  recipeId: string,
  user: User,
) {
  return db.transaction(async (tx) => {
    await requireOwnedCollection(tx, collectionId, user);

    await tx
      .delete(collectionRecipes)
      .where(
        and(
          eq(collectionRecipes.collectionId, collectionId),
          eq(collectionRecipes.recipeId, recipeId),
        ),
      );

    await tx
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(eq(collections.id, collectionId));

    return { collectionId, recipeId };
  });
}
