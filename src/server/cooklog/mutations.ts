import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "~/server/db";
import {
  cookLogEntries,
  groupMembers,
  recipes,
  type CookLogEntry,
  type User,
} from "~/server/db/schema";
import type { LogCookInput } from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Record one "I cooked this" entry for the given user. */
export async function createCookLog(
  input: LogCookInput,
  user: User,
): Promise<CookLogEntry> {
  return db.transaction(async (tx: Tx) => {
    const recipe = await tx.query.recipes.findFirst({
      where: eq(recipes.id, input.recipeId),
      columns: { id: true, groupId: true },
    });
    if (!recipe) throw new Error("NOT_FOUND");

    // Resolve the group to share to (#352): only when the cook opts in, the
    // recipe belongs to a group, and the cook is actually a member of it. This
    // keeps a personal cook private unless deliberately shared to their family.
    let sharedToGroupId: string | null = null;
    if (input.shareWithFamily && recipe.groupId) {
      const membership = await tx.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, recipe.groupId),
          eq(groupMembers.userId, user.id),
        ),
        columns: { id: true },
      });
      if (membership) sharedToGroupId = recipe.groupId;
    }

    const [created] = await tx
      .insert(cookLogEntries)
      .values({
        recipeId: input.recipeId,
        userId: user.id,
        cookedAt: input.cookedAt ?? new Date(),
        note: input.note ?? null,
        photoUrl: input.photoUrl ?? null,
        servingsMade: input.servingsMade ?? null,
        sharedToGroupId,
      })
      .returning();

    return created!;
  });
}

/** Delete a cook-log entry. Only the cook who logged it may remove it. */
export async function deleteCookLog(
  entryId: string,
  user: User,
): Promise<void> {
  const [row] = await db
    .delete(cookLogEntries)
    .where(
      and(eq(cookLogEntries.id, entryId), eq(cookLogEntries.userId, user.id)),
    )
    .returning({ id: cookLogEntries.id });
  if (!row) throw new Error("NOT_FOUND");
}
