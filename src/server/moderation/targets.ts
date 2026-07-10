import "server-only";

import { eq } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { type db } from "~/server/db";
import {
  comments,
  reviews,
  cookLogEntries,
  type ModerationTarget,
} from "~/server/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

function eqId(column: PgColumn, id: string) {
  return eq(column, id);
}

/** A moderation target resolved to the fields every safety check needs. */
export type ResolvedTarget = {
  targetType: ModerationTarget;
  targetId: string;
  /** Who authored the reported content. */
  authorId: string;
  recipeId: string;
  /** The owning recipe, for access checks + which group can moderate it. */
  recipe: {
    authorId: string;
    visibility: string;
    groupId: string | null;
  };
  /** Short preview text for the moderation queue row. */
  preview: string;
  hiddenAt: Date | null;
};

const recipeColumns = {
  columns: { authorId: true, visibility: true, groupId: true },
} as const;

/**
 * Load a reported/moderated item (comment, review, or cook-log post) with just
 * the fields moderation needs: its author, its owning recipe (for access +
 * group), a text preview, and whether it's already hidden. Returns null if the
 * target no longer exists. Shared by reporting (#356) and the queue (#357).
 */
export async function resolveTarget(
  exec: Tx,
  targetType: ModerationTarget,
  targetId: string,
): Promise<ResolvedTarget | null> {
  if (targetType === "comment") {
    const row = await exec.query.comments.findFirst({
      where: eqId(comments.id, targetId),
      columns: {
        id: true,
        userId: true,
        recipeId: true,
        body: true,
        hiddenAt: true,
      },
      with: { recipe: recipeColumns },
    });
    if (!row?.recipe) return null;
    return {
      targetType,
      targetId,
      authorId: row.userId,
      recipeId: row.recipeId,
      recipe: row.recipe,
      preview: row.body,
      hiddenAt: row.hiddenAt,
    };
  }

  if (targetType === "review") {
    const row = await exec.query.reviews.findFirst({
      where: eqId(reviews.id, targetId),
      columns: {
        id: true,
        userId: true,
        recipeId: true,
        title: true,
        body: true,
        hiddenAt: true,
      },
      with: { recipe: recipeColumns },
    });
    if (!row?.recipe) return null;
    return {
      targetType,
      targetId,
      authorId: row.userId,
      recipeId: row.recipeId,
      recipe: row.recipe,
      preview: row.title ?? row.body ?? "(review)",
      hiddenAt: row.hiddenAt,
    };
  }

  const row = await exec.query.cookLogEntries.findFirst({
    where: eqId(cookLogEntries.id, targetId),
    columns: {
      id: true,
      userId: true,
      recipeId: true,
      note: true,
      hiddenAt: true,
    },
    with: { recipe: recipeColumns },
  });
  if (!row?.recipe) return null;
  return {
    targetType,
    targetId,
    authorId: row.userId,
    recipeId: row.recipeId,
    recipe: row.recipe,
    preview: row.note ?? "(cook photo)",
    hiddenAt: row.hiddenAt,
  };
}
