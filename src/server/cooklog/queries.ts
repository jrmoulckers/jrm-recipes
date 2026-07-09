import "server-only";

import { and, asc, count, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { cookLogEntries, groupMembers, recipes } from "~/server/db/schema";
import { filterBlocked, getHiddenAuthorIds } from "~/server/moderation/blocks";

/** A single cook-log entry, shaped for rendering a timeline row. */
export type CookLogItem = {
  id: string;
  cookedAt: Date;
  note: string | null;
  photoUrl: string | null;
  servingsMade: number | null;
};

/** A recent cook plus the recipe it belongs to (for the personal journal). */
export type RecentCookItem = CookLogItem & {
  recipe: {
    id: string;
    slug: string;
    title: string;
    coverImageUrl: string | null;
  } | null;
};

/**
 * The viewer's own cooks of a single recipe, newest first. Scoped to the
 * viewer so the journal stays personal (no leaking who else cooked a shared
 * family recipe).
 */
export async function getRecipeCookLog(
  recipeId: string,
  userId: string | null,
): Promise<CookLogItem[]> {
  if (!isDbConfigured() || !userId) return [];
  const rows = await db.query.cookLogEntries.findMany({
    where: and(
      eq(cookLogEntries.recipeId, recipeId),
      eq(cookLogEntries.userId, userId),
    ),
    orderBy: [desc(cookLogEntries.cookedAt)],
    columns: {
      id: true,
      cookedAt: true,
      note: true,
      photoUrl: true,
      servingsMade: true,
    },
  });
  return rows;
}

/** How many times the viewer has cooked a recipe. */
export async function getCookCount(
  recipeId: string,
  userId: string | null,
): Promise<number> {
  if (!isDbConfigured() || !userId) return 0;
  const [row] = await db
    .select({ value: count() })
    .from(cookLogEntries)
    .where(
      and(
        eq(cookLogEntries.recipeId, recipeId),
        eq(cookLogEntries.userId, userId),
      ),
    );
  return row?.value ?? 0;
}

/** The viewer's most recent cooks across every recipe (their journal feed). */
export async function getMyRecentCooks(
  userId: string,
  limit = 24,
): Promise<RecentCookItem[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.cookLogEntries.findMany({
    where: eq(cookLogEntries.userId, userId),
    orderBy: [desc(cookLogEntries.cookedAt)],
    limit,
    columns: {
      id: true,
      cookedAt: true,
      note: true,
      photoUrl: true,
      servingsMade: true,
    },
    with: {
      recipe: {
        columns: { id: true, slug: true, title: true, coverImageUrl: true },
      },
    },
  });
  return rows;
}

/** Filters a viewer can narrow their cooking journal by (#364). */
export type JournalFilter = {
  /** Only cooks of this recipe. */
  recipeId?: string | null;
  /** Only cooks at or after this instant (time-range lower bound). */
  since?: Date | null;
};

/** Shared WHERE for the viewer's own journal, applying the optional filters. */
function journalWhere(userId: string, filter: JournalFilter) {
  const clauses = [eq(cookLogEntries.userId, userId)];
  if (filter.recipeId) {
    clauses.push(eq(cookLogEntries.recipeId, filter.recipeId));
  }
  if (filter.since) {
    clauses.push(gte(cookLogEntries.cookedAt, filter.since));
  }
  return and(...clauses);
}

/**
 * The viewer's cooks matching the journal filters, newest first (#364). A
 * generalization of {@link getMyRecentCooks} that also accepts a recipe and a
 * time-range bound so the journal can be sliced without new tables.
 */
export async function getFilteredCooks(
  userId: string,
  filter: JournalFilter = {},
  limit = 60,
): Promise<RecentCookItem[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.cookLogEntries.findMany({
    where: journalWhere(userId, filter),
    orderBy: [desc(cookLogEntries.cookedAt)],
    limit,
    columns: {
      id: true,
      cookedAt: true,
      note: true,
      photoUrl: true,
      servingsMade: true,
    },
    with: {
      recipe: {
        columns: { id: true, slug: true, title: true, coverImageUrl: true },
      },
    },
  });
  return rows;
}

/** A most-cooked recipe with its cook count, for the journal insights strip. */
export type TopCookedRecipe = {
  id: string;
  slug: string;
  title: string;
  count: number;
};

/** Insight tiles for the cooking journal, computed over the filtered set (#364). */
export type JournalInsights = {
  totalCooks: number;
  mostRecent: Date | null;
  topRecipes: TopCookedRecipe[];
};

/**
 * Aggregate insights for the journal — total cooks, the most-recent cook, and
 * the top-3 most-cooked recipes — computed with the same filters as the list so
 * the numbers always reconcile with what's shown (#364). No new tables.
 */
export async function getJournalInsights(
  userId: string,
  filter: JournalFilter = {},
): Promise<JournalInsights> {
  if (!isDbConfigured()) {
    return { totalCooks: 0, mostRecent: null, topRecipes: [] };
  }
  const where = journalWhere(userId, filter);

  const [[totals], latest, topRecipes] = await Promise.all([
    db.select({ total: count() }).from(cookLogEntries).where(where),
    db.query.cookLogEntries.findFirst({
      where,
      orderBy: [desc(cookLogEntries.cookedAt)],
      columns: { cookedAt: true },
    }),
    db
      .select({
        id: recipes.id,
        slug: recipes.slug,
        title: recipes.title,
        count: sql<number>`count(*)::int`,
      })
      .from(cookLogEntries)
      .innerJoin(recipes, eq(cookLogEntries.recipeId, recipes.id))
      .where(where)
      .groupBy(recipes.id, recipes.slug, recipes.title)
      .orderBy(sql`count(*) desc`)
      .limit(3),
  ]);

  return {
    totalCooks: totals?.total ?? 0,
    mostRecent: latest?.cookedAt ?? null,
    topRecipes,
  };
}

/** A recipe the viewer has cooked, for the journal's recipe filter dropdown. */
export type CookedRecipeOption = { id: string; title: string };

/**
 * The distinct recipes the viewer has ever cooked, alphabetical, to populate
 * the journal recipe filter (#364).
 */
export async function getCookedRecipeOptions(
  userId: string,
): Promise<CookedRecipeOption[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .select({ id: recipes.id, title: recipes.title })
    .from(cookLogEntries)
    .innerJoin(recipes, eq(cookLogEntries.recipeId, recipes.id))
    .where(eq(cookLogEntries.userId, userId))
    .groupBy(recipes.id, recipes.title)
    .orderBy(asc(recipes.title));
  return rows;
}

/** A family member's shared cook of a recipe, for the "Made by your family" strip. */
export type FamilyCookItem = {
  id: string;
  cookedAt: Date;
  note: string | null;
  photoUrl: string | null;
  cook: {
    id: string;
    name: string | null;
    handle: string | null;
    avatarUrl: string | null;
  } | null;
};

/**
 * The recipe's group, if the viewer may share a cook to it (#352): the recipe
 * belongs to a group AND the viewer is a member. Returns null otherwise, which
 * hides the "Share with my family" affordance.
 */
export async function getShareableGroupForRecipe(
  recipeId: string,
  userId: string | null,
): Promise<{ id: string; name: string } | null> {
  if (!isDbConfigured() || !userId) return null;
  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: { groupId: true },
    with: { group: { columns: { id: true, name: true } } },
  });
  if (!recipe?.groupId || !recipe.group) return null;

  const membership = await db.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, recipe.groupId),
      eq(groupMembers.userId, userId),
    ),
    columns: { id: true },
  });
  if (!membership) return null;
  return { id: recipe.group.id, name: recipe.group.name };
}

/**
 * Cooks of this recipe shared to a family the viewer belongs to (#352): the
 * "Made by your family" photo strip. Scoped to the recipe's group and only
 * returned when the viewer is a member, so private cooks never leak. Excludes
 * moderated (hidden) entries.
 */
export async function getFamilyCooks(
  recipeId: string,
  userId: string | null,
  limit = 12,
): Promise<FamilyCookItem[]> {
  if (!isDbConfigured() || !userId) return [];
  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: { groupId: true },
  });
  if (!recipe?.groupId) return [];

  const membership = await db.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, recipe.groupId),
      eq(groupMembers.userId, userId),
    ),
    columns: { id: true },
  });
  if (!membership) return [];

  const rows = await db.query.cookLogEntries.findMany({
    where: and(
      eq(cookLogEntries.recipeId, recipeId),
      eq(cookLogEntries.sharedToGroupId, recipe.groupId),
      isNull(cookLogEntries.hiddenAt),
    ),
    orderBy: [desc(cookLogEntries.cookedAt)],
    limit,
    columns: { id: true, cookedAt: true, note: true, photoUrl: true },
    with: {
      user: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
    },
  });
  // Block filtering (#355): drop cooks shared by a member the viewer has
  // blocked (or who blocked them), mirroring getGroupActivity.
  const hiddenAuthorIds = await getHiddenAuthorIds(userId);
  return filterBlocked(rows, (row) => row.user?.id, hiddenAuthorIds).map(
    (row) => ({
      id: row.id,
      cookedAt: row.cookedAt,
      note: row.note,
      photoUrl: row.photoUrl,
      cook: row.user ?? null,
    }),
  );
}
