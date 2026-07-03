import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  groupMembers,
  recipeIngredients,
  recipeSteps,
  recipes,
  type User,
} from "~/server/db/schema";

/** Recipe with everything needed to render a detail page. */
export type FullRecipe = NonNullable<Awaited<ReturnType<typeof getRecipe>>>;
export type RecipeListItem = Awaited<ReturnType<typeof listMyRecipes>>[number];

/** Aggregate 1–5 ratings into an average + count. */
export function ratingSummary(values: { value: number }[]) {
  if (values.length === 0) return { average: 0, count: 0 };
  const sum = values.reduce((acc, r) => acc + r.value, 0);
  return { average: Math.round((sum / values.length) * 10) / 10, count: values.length };
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

/** Publicly published recipes, newest first (the discover feed). */
export async function listPublicRecipes(limit = 48) {
  if (!isDbConfigured()) return [];
  return db.query.recipes.findMany({
    where: and(eq(recipes.visibility, "public"), eq(recipes.status, "published")),
    orderBy: [desc(recipes.publishedAt), desc(recipes.updatedAt)],
    limit,
    with: { author: true, tags: { with: { tag: true } }, ratings: true },
  });
}

function canView(recipe: { authorId: string; visibility: string; groupId: string | null }, viewer: User | null, groupIds: string[]) {
  if (recipe.visibility === "public" || recipe.visibility === "unlisted") return true;
  if (recipe.authorId === viewer?.id) return true;
  if (recipe.visibility === "group" && recipe.groupId && groupIds.includes(recipe.groupId)) return true;
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
export async function listLibrary(viewer: User | null) {
  if (!isDbConfigured() || !viewer) return [];
  const groupIds = await viewerGroupIds(viewer);
  const scope =
    groupIds.length > 0
      ? or(eq(recipes.authorId, viewer.id), inArray(recipes.groupId, groupIds))
      : eq(recipes.authorId, viewer.id);
  return db.query.recipes.findMany({
    where: scope,
    orderBy: [desc(recipes.updatedAt)],
    with: { author: true, tags: { with: { tag: true } }, ratings: true },
  });
}
