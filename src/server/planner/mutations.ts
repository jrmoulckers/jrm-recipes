import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  groupMembers,
  mealPlanEntries,
  recipes,
  type MealSlot,
  type User,
} from "~/server/db/schema";
import type { AddEntryInput, MoveEntryInput } from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function viewerGroupIds(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    columns: { groupId: true },
  });
  return rows.map((row) => row.groupId);
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

/** The next free position within a user's day + slot column. */
async function nextPosition(
  tx: Tx,
  userId: string,
  date: string,
  slot: MealSlot,
): Promise<number> {
  const rows = await tx
    .select({
      next: sql<number>`coalesce(max(${mealPlanEntries.position}), -1) + 1`,
    })
    .from(mealPlanEntries)
    .where(
      and(
        eq(mealPlanEntries.userId, userId),
        eq(mealPlanEntries.date, date),
        eq(mealPlanEntries.slot, slot),
      ),
    );
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
      const membership = await tx.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, input.groupId),
          eq(groupMembers.userId, user.id),
        ),
        columns: { id: true },
      });
      if (!membership) throw new Error("FORBIDDEN");
      groupId = input.groupId;
    }

    const position =
      input.position ??
      (await nextPosition(tx, user.id, input.date, input.slot));

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

export async function moveEntry(input: MoveEntryInput, user: User) {
  return db.transaction(async (tx) => {
    const entry = await tx.query.mealPlanEntries.findFirst({
      where: and(
        eq(mealPlanEntries.id, input.entryId),
        eq(mealPlanEntries.userId, user.id),
      ),
      columns: { id: true },
    });
    if (!entry) throw new Error("NOT_FOUND");

    const position =
      input.position ??
      (await nextPosition(tx, user.id, input.date, input.slot));

    const [updated] = await tx
      .update(mealPlanEntries)
      .set({ date: input.date, slot: input.slot, position })
      .where(eq(mealPlanEntries.id, input.entryId))
      .returning();

    return updated!;
  });
}

export async function removeEntry(entryId: string, user: User) {
  const [row] = await db
    .delete(mealPlanEntries)
    .where(
      and(
        eq(mealPlanEntries.id, entryId),
        eq(mealPlanEntries.userId, user.id),
      ),
    )
    .returning({ id: mealPlanEntries.id });
  if (!row) throw new Error("NOT_FOUND");
  return row;
}
