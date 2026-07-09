import "server-only";

import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  groupMembers,
  groups,
  mealPlanEntries,
  recipes,
  type User,
} from "~/server/db/schema";

/**
 * Meal-plan entries for a user between two calendar dates (inclusive). Dates are
 * `yyyy-MM-dd` strings, matching the `date` column, so lexical comparison is also
 * chronological. Guarded so the page renders with no database configured.
 *
 * Scoped to the viewer's *personal* plane (`groupId IS NULL`) so a member's
 * group-shared entries (issue #363) live only on the group board and never
 * double-show here. Historic entries all have a null group, so this is a no-op
 * for existing plans.
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
      isNull(mealPlanEntries.groupId),
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

/**
 * Dinner entries for a week, with just enough recipe detail (title + total
 * time) to render the printable fridge menu (#438). Dinner slot only, ordered
 * by day. Guarded so the print page renders with no database configured.
 */
export async function listWeekDinners(
  userId: string,
  startDate: string,
  endDate: string,
) {
  if (!isDbConfigured()) return [];
  return db.query.mealPlanEntries.findMany({
    where: and(
      eq(mealPlanEntries.userId, userId),
      eq(mealPlanEntries.slot, "dinner"),
      gte(mealPlanEntries.date, startDate),
      lte(mealPlanEntries.date, endDate),
    ),
    orderBy: [asc(mealPlanEntries.date), asc(mealPlanEntries.position)],
    columns: { date: true, note: true },
    with: {
      recipe: { columns: { title: true, totalMinutes: true } },
    },
  });
}

export type WeekDinnerEntry = Awaited<
  ReturnType<typeof listWeekDinners>
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

/**
 * The groups a viewer belongs to, lightweight enough to populate the planner's
 * scope selector (issue #363). Ordered by name for a stable menu.
 */
export async function listViewerGroups(userId: string) {
  if (!isDbConfigured()) return [];
  const rows = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    columns: {},
    with: {
      group: { columns: { id: true, slug: true, name: true } },
    },
  });
  return rows
    .map((row) => row.group)
    .filter((group): group is NonNullable<typeof group> => group != null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type ViewerGroup = Awaited<
  ReturnType<typeof listViewerGroups>
>[number];

/**
 * Every member's entries for a group's week (issue #363). Membership is enforced
 * server-side: a non-member gets `null`, which the page turns into a
 * not-found/redirect — the board is never rendered for someone outside the
 * group. Each entry carries its author so cards can show who planned it.
 */
export async function listGroupEntriesInRange(
  viewer: User,
  groupId: string,
  startDate: string,
  endDate: string,
) {
  if (!isDbConfigured()) return null;

  const membership = await db.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, viewer.id),
    ),
    columns: { id: true },
  });
  if (!membership) return null;

  return db.query.mealPlanEntries.findMany({
    where: and(
      eq(mealPlanEntries.groupId, groupId),
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
      user: { columns: { id: true, name: true } },
    },
  });
}

export type GroupPlannerEntry = NonNullable<
  Awaited<ReturnType<typeof listGroupEntriesInRange>>
>[number];
