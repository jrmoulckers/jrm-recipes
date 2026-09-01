import 'server-only';

import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm';

import { db } from '~/server/db';
import {
  groupMembers,
  mealPlanEntries,
  recipes,
  type MealSlot,
  type User,
} from '~/server/db/schema';
import { addDaysToParam, getPlannerWeek, parseDateParam, toDateParam } from './week';
import type { AddEntryInput, MealWithLeftoversInput, MoveEntryInput } from './validation';
import { planWarningsForRecipe, type PlanSafetyWarning } from '~/server/dietary/gating';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function viewerGroupIds(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    columns: { groupId: true },
  });
  return rows.map((row) => row.groupId);
}

/** True when `userId` is a member of `groupId` (issue #363 access control). */
async function isGroupMember(tx: Tx, groupId: string, userId: string): Promise<boolean> {
  const membership = await tx.query.groupMembers.findFirst({
    where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    columns: { id: true },
  });
  return membership != null;
}

function canView(
  recipe: { authorId: string | null; visibility: string; groupId: string | null },
  viewer: User,
  groupIds: string[],
) {
  if (recipe.visibility === 'public' || recipe.visibility === 'unlisted') return true;
  if (recipe.authorId === viewer.id) return true;
  return (
    recipe.visibility === 'group' && recipe.groupId != null && groupIds.includes(recipe.groupId)
  );
}

/** The next free position within a day + slot column. Scoped to the group's
 * shared column when `groupId` is set (issue #363), otherwise to the user's
 * personal column (`group_id IS NULL`) so the two planes number independently. */
async function nextPosition(
  tx: Tx,
  userId: string,
  date: string,
  slot: MealSlot,
  groupId: string | null = null,
): Promise<number> {
  const scope =
    groupId != null
      ? eq(mealPlanEntries.groupId, groupId)
      : and(eq(mealPlanEntries.userId, userId), isNull(mealPlanEntries.groupId));
  const rows = await tx
    .select({
      next: sql<number>`coalesce(max(${mealPlanEntries.position}), -1) + 1`,
    })
    .from(mealPlanEntries)
    .where(and(scope, eq(mealPlanEntries.date, date), eq(mealPlanEntries.slot, slot)));
  return Number(rows[0]?.next ?? 0);
}

export async function addEntry(input: AddEntryInput, user: User) {
  const { entry, recipeId } = await db.transaction(async (tx) => {
    let recipeId: string | null = null;
    if (input.recipeId) {
      const recipe = await tx.query.recipes.findFirst({
        where: eq(recipes.id, input.recipeId),
        columns: { id: true, authorId: true, visibility: true, groupId: true },
      });
      if (!recipe) throw new Error('NOT_FOUND');
      const groupIds = recipe.visibility === 'group' ? await viewerGroupIds(tx, user.id) : [];
      if (!canView(recipe, user, groupIds)) throw new Error('FORBIDDEN');
      recipeId = recipe.id;
    }

    let groupId: string | null = null;
    if (input.groupId) {
      if (!(await isGroupMember(tx, input.groupId, user.id))) throw new Error('FORBIDDEN');
      groupId = input.groupId;
    }

    const position =
      input.position ?? (await nextPosition(tx, user.id, input.date, input.slot, groupId));

    const [created] = await tx
      .insert(mealPlanEntries)
      .values({
        userId: user.id,
        groupId,
        date: input.date,
        slot: input.slot,
        recipeId,
        plannedServings: recipeId ? (input.servings ?? null) : null,
        servingsMade: recipeId ? (input.servings ?? null) : null,
        note: input.note ?? null,
        position,
      })
      .returning();

    return { entry: created!, recipeId };
  });

  // Proactive allergen/diet gating (#: structured allergens on the food graph):
  // cross-check the added recipe against saved family profiles and return a
  // warning at add-time. Best-effort. Never blocks the entry that just saved.
  const warnings = recipeId ? await planWarningsForRecipe(user.id, recipeId) : [];

  return { entry, warnings };
}

export type MealWithLeftoversResult = {
  primaryId: string;
  leftoverIds: string[];
  warnings: PlanSafetyWarning[];
};

/** Create one cooked meal and one or more linked serving allocations. */
export async function addMealWithLeftovers(
  input: MealWithLeftoversInput,
  user: User,
): Promise<MealWithLeftoversResult> {
  const { primaryId, leftoverIds, recipeId } = await db.transaction(async (tx) => {
    const recipe = await tx.query.recipes.findFirst({
      where: eq(recipes.id, input.recipeId),
      columns: {
        id: true,
        authorId: true,
        visibility: true,
        groupId: true,
      },
    });
    if (!recipe) throw new Error('NOT_FOUND');
    const groupIds = recipe.visibility === 'group' ? await viewerGroupIds(tx, user.id) : [];
    if (!canView(recipe, user, groupIds)) throw new Error('FORBIDDEN');

    let entryGroupId: string | null = null;
    if (input.groupId) {
      if (!(await isGroupMember(tx, input.groupId, user.id))) throw new Error('FORBIDDEN');
      entryGroupId = input.groupId;
    }

    const primaryPosition = await nextPosition(tx, user.id, input.date, input.slot, entryGroupId);
    const [primary] = await tx
      .insert(mealPlanEntries)
      .values({
        userId: user.id,
        groupId: entryGroupId,
        date: input.date,
        slot: input.slot,
        recipeId: recipe.id,
        plannedServings: input.mealServings,
        servingsMade:
          input.mealServings +
          input.leftovers.reduce((total, allocation) => total + allocation.servings, 0),
        note: input.note ?? null,
        position: primaryPosition,
      })
      .returning({ id: mealPlanEntries.id });

    const leftoverIds: string[] = [];
    for (const allocation of input.leftovers) {
      const position = await nextPosition(
        tx,
        user.id,
        allocation.date,
        allocation.slot,
        entryGroupId,
      );
      const [leftover] = await tx
        .insert(mealPlanEntries)
        .values({
          userId: user.id,
          groupId: entryGroupId,
          date: allocation.date,
          slot: allocation.slot,
          recipeId: recipe.id,
          plannedServings: allocation.servings,
          leftoverSourceId: primary!.id,
          position,
        })
        .returning({ id: mealPlanEntries.id });
      leftoverIds.push(leftover!.id);
    }

    return {
      primaryId: primary!.id,
      leftoverIds,
      recipeId: recipe.id,
    };
  });

  // Proactive gating: warn if the cooked recipe conflicts with a saved
  // family profile. Best-effort. Never blocks the entries that just saved.
  const warnings = await planWarningsForRecipe(user.id, recipeId);
  return { primaryId, leftoverIds, warnings };
}

export async function moveEntry(input: MoveEntryInput, user: User) {
  return db.transaction(async (tx) => {
    // A personal entry moves only for its owner. A group entry moves for any
    // member of that group (issue #363).
    const entry = await tx.query.mealPlanEntries.findFirst({
      where: eq(mealPlanEntries.id, input.entryId),
      columns: { id: true, userId: true, groupId: true },
    });
    if (!entry) throw new Error('NOT_FOUND');
    if (entry.groupId) {
      if (!(await isGroupMember(tx, entry.groupId, user.id))) throw new Error('FORBIDDEN');
    } else if (entry.userId !== user.id) {
      throw new Error('NOT_FOUND');
    }

    const position =
      input.position ?? (await nextPosition(tx, user.id, input.date, input.slot, entry.groupId));

    const [updated] = await tx
      .update(mealPlanEntries)
      .set({ date: input.date, slot: input.slot, position })
      .where(eq(mealPlanEntries.id, input.entryId))
      .returning();

    return updated!;
  });
}

export async function removeEntry(entryId: string, user: User, removeAllocations = false) {
  return db.transaction(async (tx) => {
    // Owner removes their personal entries. Any member removes a group entry
    // (issue #363).
    const entry = await tx.query.mealPlanEntries.findFirst({
      where: eq(mealPlanEntries.id, entryId),
      columns: {
        id: true,
        userId: true,
        groupId: true,
        plannedServings: true,
        leftoverSourceId: true,
      },
    });
    if (!entry) throw new Error('NOT_FOUND');
    if (entry.groupId) {
      if (!(await isGroupMember(tx, entry.groupId, user.id))) throw new Error('FORBIDDEN');
    } else if (entry.userId !== user.id) {
      throw new Error('NOT_FOUND');
    }

    if (removeAllocations) {
      await tx.delete(mealPlanEntries).where(eq(mealPlanEntries.leftoverSourceId, entryId));
    } else if (entry.leftoverSourceId == null) {
      await tx
        .update(mealPlanEntries)
        .set({
          leftoverSourceId: null,
          servingsMade: mealPlanEntries.plannedServings,
        })
        .where(eq(mealPlanEntries.leftoverSourceId, entryId));
    }

    const [row] = await tx
      .delete(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entryId))
      .returning({ id: mealPlanEntries.id });
    if (!row) throw new Error('NOT_FOUND');

    if (entry.leftoverSourceId && entry.plannedServings) {
      await tx
        .update(mealPlanEntries)
        .set({
          servingsMade: sql`greatest(coalesce(${mealPlanEntries.servingsMade}, 0) - ${entry.plannedServings}, coalesce(${mealPlanEntries.plannedServings}, 1))`,
        })
        .where(eq(mealPlanEntries.id, entry.leftoverSourceId));
    }
    return row;
  });
}

export type CopyWeekResult = { copied: number; previousEmpty: boolean };

/**
 * Copy the previous week's entries onto the week containing `weekParam`, shifted
 * forward 7 days onto the matching day + slot (#434). Only *empty* cells are
 * filled, so anything already planned this week is preserved. Returns how many
 * entries were copied and whether last week was empty (for a friendly message).
 */
export async function copyPreviousWeek(
  user: User,
  weekParam: string,
  groupId: string | null = null,
  locale?: string,
): Promise<CopyWeekResult> {
  const target = getPlannerWeek(parseDateParam(weekParam), locale);
  const startParam = toDateParam(target.start);
  const endParam = toDateParam(target.end);
  const prevStart = addDaysToParam(startParam, -7);
  const prevEnd = addDaysToParam(endParam, -7);

  return db.transaction(async (tx) => {
    if (groupId != null && !(await isGroupMember(tx, groupId, user.id))) {
      throw new Error('FORBIDDEN');
    }
    const scope =
      groupId != null
        ? eq(mealPlanEntries.groupId, groupId)
        : and(eq(mealPlanEntries.userId, user.id), isNull(mealPlanEntries.groupId));
    const previous = await tx.query.mealPlanEntries.findMany({
      where: and(scope, gte(mealPlanEntries.date, prevStart), lte(mealPlanEntries.date, prevEnd)),
      orderBy: [asc(mealPlanEntries.date), asc(mealPlanEntries.position)],
      columns: {
        date: true,
        id: true,
        slot: true,
        recipeId: true,
        groupId: true,
        plannedServings: true,
        servingsMade: true,
        leftoverSourceId: true,
        note: true,
        position: true,
      },
    });

    if (previous.length === 0) return { copied: 0, previousEmpty: true };

    const current = await tx.query.mealPlanEntries.findMany({
      where: and(scope, gte(mealPlanEntries.date, startParam), lte(mealPlanEntries.date, endParam)),
      columns: { date: true, slot: true },
    });
    // Cells (day + slot) already holding something this week are left untouched.
    const occupied = new Set(current.map((e) => `${e.date}|${e.slot}`));

    const eligible = previous.filter(
      (entry) => !occupied.has(`${addDaysToParam(entry.date, 7)}|${entry.slot}`),
    );
    const copiedIds = new Map<string, string>();
    const copiedTotals = new Map<string, number>();
    let copied = 0;

    for (const entry of eligible.filter((row) => row.leftoverSourceId == null)) {
      const [created] = await tx
        .insert(mealPlanEntries)
        .values({
          userId: user.id,
          groupId,
          date: addDaysToParam(entry.date, 7),
          slot: entry.slot,
          recipeId: entry.recipeId,
          plannedServings: entry.plannedServings,
          servingsMade: entry.plannedServings ?? entry.servingsMade,
          note: entry.note,
          position: entry.position,
        })
        .returning({ id: mealPlanEntries.id });
      copiedIds.set(entry.id, created!.id);
      if (entry.plannedServings != null) {
        copiedTotals.set(entry.id, entry.plannedServings);
      }
      copied += 1;
    }

    for (const entry of eligible.filter((row) => row.leftoverSourceId != null)) {
      const sourceId = copiedIds.get(entry.leftoverSourceId!);
      await tx.insert(mealPlanEntries).values({
        userId: user.id,
        groupId,
        date: addDaysToParam(entry.date, 7),
        slot: entry.slot,
        recipeId: entry.recipeId,
        plannedServings: entry.plannedServings,
        servingsMade: sourceId ? null : entry.plannedServings,
        leftoverSourceId: sourceId ?? null,
        note: entry.note,
        position: entry.position,
      });
      if (sourceId) {
        copiedTotals.set(
          entry.leftoverSourceId!,
          (copiedTotals.get(entry.leftoverSourceId!) ?? 0) + (entry.plannedServings ?? 0),
        );
      }
      copied += 1;
    }

    for (const [oldSourceId, servingsMade] of copiedTotals) {
      const sourceId = copiedIds.get(oldSourceId);
      if (!sourceId) continue;
      await tx
        .update(mealPlanEntries)
        .set({ servingsMade })
        .where(eq(mealPlanEntries.id, sourceId));
    }

    return { copied, previousEmpty: false };
  });
}
