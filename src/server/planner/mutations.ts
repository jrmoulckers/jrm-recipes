import "server-only";

import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  groupMembers,
  mealPlanEntries,
  recipes,
  type MealSlot,
  type User,
} from "~/server/db/schema";
import {
  addDaysToParam,
  getPlannerWeek,
  parseDateParam,
  toDateParam,
} from "./week";
import type { AddEntryInput, BatchCookInput, MoveEntryInput } from "./validation";
import { formatLeftoversNote } from "~/lib/planner-batch";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function viewerGroupIds(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    columns: { groupId: true },
  });
  return rows.map((row) => row.groupId);
}

/** True when `userId` is a member of `groupId` (issue #363 access control). */
async function isGroupMember(
  tx: Tx,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const membership = await tx.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, userId),
    ),
    columns: { id: true },
  });
  return membership != null;
}

function canView(
  recipe: { authorId: string; visibility: string; groupId: string | null },
  viewer: User,
  groupIds: string[],
) {
  if (recipe.visibility === "public" || recipe.visibility === "unlisted")
    return true;
  if (recipe.authorId === viewer.id) return true;
  return (
    recipe.visibility === "group" &&
    recipe.groupId != null &&
    groupIds.includes(recipe.groupId)
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
      : and(
          eq(mealPlanEntries.userId, userId),
          isNull(mealPlanEntries.groupId),
        );
  const rows = await tx
    .select({
      next: sql<number>`coalesce(max(${mealPlanEntries.position}), -1) + 1`,
    })
    .from(mealPlanEntries)
    .where(and(scope, eq(mealPlanEntries.date, date), eq(mealPlanEntries.slot, slot)));
  return Number(rows[0]?.next ?? 0);
}

export async function addEntry(input: AddEntryInput, user: User) {
  return db.transaction(async (tx) => {
    let recipeId: string | null = null;
    if (input.recipeId) {
      const recipe = await tx.query.recipes.findFirst({
        where: eq(recipes.id, input.recipeId),
        columns: { id: true, authorId: true, visibility: true, groupId: true },
      });
      if (!recipe) throw new Error("NOT_FOUND");
      const groupIds =
        recipe.visibility === "group" ? await viewerGroupIds(tx, user.id) : [];
      if (!canView(recipe, user, groupIds)) throw new Error("FORBIDDEN");
      recipeId = recipe.id;
    }

    let groupId: string | null = null;
    if (input.groupId) {
      if (!(await isGroupMember(tx, input.groupId, user.id)))
        throw new Error("FORBIDDEN");
      groupId = input.groupId;
    }

    const position =
      input.position ??
      (await nextPosition(tx, user.id, input.date, input.slot, groupId));

    const [created] = await tx
      .insert(mealPlanEntries)
      .values({
        userId: user.id,
        groupId,
        date: input.date,
        slot: input.slot,
        recipeId,
        note: input.note ?? null,
        position,
      })
      .returning();

    return created!;
  });
}

export type BatchCookResult = {
  primaryId: string;
  leftoversId: string;
};

/**
 * Batch cook (#380): insert the primary recipe entry and a linked leftovers
 * entry on `leftoversDate` in a single transaction. The leftovers entry reuses
 * the same `recipeId` and stores a structured note (see `~/lib/planner-batch`)
 * so the board can recognise and style it — no schema change required.
 */
export async function addBatchCook(
  input: BatchCookInput,
  user: User,
): Promise<BatchCookResult> {
  return db.transaction(async (tx) => {
    const recipe = await tx.query.recipes.findFirst({
      where: eq(recipes.id, input.recipeId),
      columns: {
        id: true,
        title: true,
        authorId: true,
        visibility: true,
        groupId: true,
      },
    });
    if (!recipe) throw new Error("NOT_FOUND");
    const groupIds =
      recipe.visibility === "group" ? await viewerGroupIds(tx, user.id) : [];
    if (!canView(recipe, user, groupIds)) throw new Error("FORBIDDEN");

    // Group-scoped batch cook (issue #363): both nights land on the shared group
    // board when a group is in scope; membership is enforced first.
    let entryGroupId: string | null = null;
    if (input.groupId) {
      if (!(await isGroupMember(tx, input.groupId, user.id)))
        throw new Error("FORBIDDEN");
      entryGroupId = input.groupId;
    }

    const primaryPosition = await nextPosition(
      tx,
      user.id,
      input.date,
      input.slot,
      entryGroupId,
    );
    const [primary] = await tx
      .insert(mealPlanEntries)
      .values({
        userId: user.id,
        groupId: entryGroupId,
        date: input.date,
        slot: input.slot,
        recipeId: recipe.id,
        note: input.note ?? null,
        position: primaryPosition,
      })
      .returning({ id: mealPlanEntries.id });

    const leftoversPosition = await nextPosition(
      tx,
      user.id,
      input.leftoversDate,
      input.slot,
      entryGroupId,
    );
    const [leftovers] = await tx
      .insert(mealPlanEntries)
      .values({
        userId: user.id,
        groupId: entryGroupId,
        date: input.leftoversDate,
        slot: input.slot,
        recipeId: recipe.id,
        note: formatLeftoversNote(recipe.title, input.multiple),
        position: leftoversPosition,
      })
      .returning({ id: mealPlanEntries.id });

    return { primaryId: primary!.id, leftoversId: leftovers!.id };
  });
}

export async function moveEntry(input: MoveEntryInput, user: User) {
  return db.transaction(async (tx) => {
    // A personal entry moves only for its owner; a group entry moves for any
    // member of that group (issue #363).
    const entry = await tx.query.mealPlanEntries.findFirst({
      where: eq(mealPlanEntries.id, input.entryId),
      columns: { id: true, userId: true, groupId: true },
    });
    if (!entry) throw new Error("NOT_FOUND");
    if (entry.groupId) {
      if (!(await isGroupMember(tx, entry.groupId, user.id)))
        throw new Error("FORBIDDEN");
    } else if (entry.userId !== user.id) {
      throw new Error("NOT_FOUND");
    }

    const position =
      input.position ??
      (await nextPosition(tx, user.id, input.date, input.slot, entry.groupId));

    const [updated] = await tx
      .update(mealPlanEntries)
      .set({ date: input.date, slot: input.slot, position })
      .where(eq(mealPlanEntries.id, input.entryId))
      .returning();

    return updated!;
  });
}

export async function removeEntry(entryId: string, user: User) {
  return db.transaction(async (tx) => {
    // Owner removes their personal entries; any member removes a group entry
    // (issue #363).
    const entry = await tx.query.mealPlanEntries.findFirst({
      where: eq(mealPlanEntries.id, entryId),
      columns: { id: true, userId: true, groupId: true },
    });
    if (!entry) throw new Error("NOT_FOUND");
    if (entry.groupId) {
      if (!(await isGroupMember(tx, entry.groupId, user.id)))
        throw new Error("FORBIDDEN");
    } else if (entry.userId !== user.id) {
      throw new Error("NOT_FOUND");
    }

    const [row] = await tx
      .delete(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entryId))
      .returning({ id: mealPlanEntries.id });
    if (!row) throw new Error("NOT_FOUND");
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
): Promise<CopyWeekResult> {
  const target = getPlannerWeek(parseDateParam(weekParam));
  const startParam = toDateParam(target.start);
  const endParam = toDateParam(target.end);
  const prevStart = addDaysToParam(startParam, -7);
  const prevEnd = addDaysToParam(endParam, -7);

  return db.transaction(async (tx) => {
    const previous = await tx.query.mealPlanEntries.findMany({
      where: and(
        eq(mealPlanEntries.userId, user.id),
        gte(mealPlanEntries.date, prevStart),
        lte(mealPlanEntries.date, prevEnd),
      ),
      orderBy: [asc(mealPlanEntries.date), asc(mealPlanEntries.position)],
      columns: {
        date: true,
        slot: true,
        recipeId: true,
        groupId: true,
        note: true,
        position: true,
      },
    });

    if (previous.length === 0) return { copied: 0, previousEmpty: true };

    const current = await tx.query.mealPlanEntries.findMany({
      where: and(
        eq(mealPlanEntries.userId, user.id),
        gte(mealPlanEntries.date, startParam),
        lte(mealPlanEntries.date, endParam),
      ),
      columns: { date: true, slot: true },
    });
    // Cells (day + slot) already holding something this week are left untouched.
    const occupied = new Set(current.map((e) => `${e.date}|${e.slot}`));

    const rows = previous
      .map((entry) => ({
        userId: user.id,
        groupId: entry.groupId,
        date: addDaysToParam(entry.date, 7),
        slot: entry.slot,
        recipeId: entry.recipeId,
        note: entry.note,
        position: entry.position,
      }))
      .filter((row) => !occupied.has(`${row.date}|${row.slot}`));

    if (rows.length === 0) return { copied: 0, previousEmpty: false };

    await tx.insert(mealPlanEntries).values(rows);
    return { copied: rows.length, previousEmpty: false };
  });
}
