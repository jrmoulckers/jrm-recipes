import "server-only";

import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  groupMembers,
  mealPlanEntries,
  recipes,
  type User,
} from "~/server/db/schema";

/**
 * Meal-plan entries for a user between two calendar dates (inclusive). Dates are
 * `yyyy-MM-dd` strings, matching the `date` column, so lexical comparison is also
 * chronological. Guarded so the page renders with no database configured.
 */
export async function listEntriesInRange(
  userId: string,
  startDate: string,
  endDate: string,
) {
  if (!isDbConfigured()) return [];
  return db.query.mealPlanEntries.findMany({
    where: and(
      eq(mealPlanEntries.userId, userId),
      gte(mealPlanEntries.date, startDate),
      lte(mealPlanEntries.date, endDate),
    ),
    orderBy: [
      asc(mealPlanEntries.date),
      asc(mealPlanEntries.position),
      asc(mealPlanEntries.createdAt),
    ],
    with: {
      recipe: {
        columns: { id: true, slug: true, title: true, coverImageUrl: true },
      },
    },
  });
}

export type PlannerEntry = Awaited<
  ReturnType<typeof listEntriesInRange>
>[number];

/**
 * Entries planned for a single date, each with enough recipe text (step
 * instructions + ingredient items/notes) to run the prep-ahead heuristic
 * (#388). Kept lean — no media, no scaling columns — since it only feeds a
 * keyword scan. Guarded so the page renders with no database configured.
 */
export async function listEntriesWithPrepText(userId: string, date: string) {
  if (!isDbConfigured()) return [];
  return db.query.mealPlanEntries.findMany({
    where: and(
      eq(mealPlanEntries.userId, userId),
      eq(mealPlanEntries.date, date),
    ),
    orderBy: [asc(mealPlanEntries.position), asc(mealPlanEntries.createdAt)],
    with: {
      recipe: {
        columns: { id: true, slug: true, title: true },
        with: {
          ingredients: { columns: { item: true, note: true } },
          steps: { columns: { instruction: true } },
        },
      },
    },
  });
}

export type PrepTextEntry = Awaited<
  ReturnType<typeof listEntriesWithPrepText>
>[number];

async function viewerGroupIds(userId: string): Promise<string[]> {
  const rows = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    columns: { groupId: true },
  });
  return rows.map((row) => row.groupId);
}

/**
 * Recipes a viewer can add to their plan: everything in their library (their own
 * recipes plus their groups'). Lightweight columns only — enough for the picker.
 */
export async function listPlannableRecipes(viewer: User | null) {
  if (!isDbConfigured() || !viewer) return [];
  const groupIds = await viewerGroupIds(viewer.id);
  const scope =
    groupIds.length > 0
      ? or(eq(recipes.authorId, viewer.id), inArray(recipes.groupId, groupIds))
      : eq(recipes.authorId, viewer.id);
  return db.query.recipes.findMany({
    where: scope,
    orderBy: [asc(recipes.title)],
    columns: { id: true, slug: true, title: true, coverImageUrl: true },
  });
}

export type PlannableRecipe = Awaited<
  ReturnType<typeof listPlannableRecipes>
>[number];
