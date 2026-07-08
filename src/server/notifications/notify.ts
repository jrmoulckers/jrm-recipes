import "server-only";

import { db } from "~/server/db";
import { notifications, type NotificationType } from "~/server/db/schema";

/**
 * `notify()` — the single write path for the notification center (issue #348).
 *
 * Every social feature (mentions, comment replies, suggestions, reviews, cooks,
 * reactions, group joins, cook-along invites/reminders, moderation reports)
 * funnels through here so notifications are created consistently and in one
 * place. Callers may pass a transaction executor so a notification is written
 * atomically with the event that triggered it (e.g. inside `createComment`).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A db handle or an in-flight transaction — either can insert a notification. */
export type NotifyExecutor = typeof db | Tx;

export type NotifyParams = {
  /** Who receives the notification. */
  recipientId: string;
  /** Who caused it (null for system/reminder events with no actor). */
  actorId?: string | null;
  type: NotificationType;
  /** Recipe the event relates to (real FK, cleaned up on delete). */
  recipeId?: string | null;
  /** Group the event relates to (real FK, cleaned up on delete). */
  groupId?: string | null;
  /** Opaque id of the specific comment/review/cook-along the event points at. */
  entityId?: string | null;
  /** Short pre-rendered label (e.g. a recipe title) for the inbox row. */
  context?: string | null;
};

/**
 * Create a notification. No-ops when the recipient is the actor (you never
 * notify yourself about your own action) so callers don't have to special-case
 * self-mentions or rating your own recipe.
 */
export async function notify(
  exec: NotifyExecutor,
  params: NotifyParams,
): Promise<void> {
  if (params.actorId && params.actorId === params.recipientId) return;

  await exec.insert(notifications).values({
    recipientId: params.recipientId,
    actorId: params.actorId ?? null,
    type: params.type,
    recipeId: params.recipeId ?? null,
    groupId: params.groupId ?? null,
    entityId: params.entityId ?? null,
    context: params.context?.slice(0, 500) ?? null,
  });
}

/**
 * Fan a single event out to many recipients (e.g. cook-along invites to a whole
 * group). De-dupes recipient ids and skips the actor, inserting in one batch.
 */
export async function notifyMany(
  exec: NotifyExecutor,
  recipientIds: string[],
  params: Omit<NotifyParams, "recipientId">,
): Promise<void> {
  const unique = [...new Set(recipientIds)].filter(
    (id) => !(params.actorId && params.actorId === id),
  );
  if (unique.length === 0) return;

  await exec.insert(notifications).values(
    unique.map((recipientId) => ({
      recipientId,
      actorId: params.actorId ?? null,
      type: params.type,
      recipeId: params.recipeId ?? null,
      groupId: params.groupId ?? null,
      entityId: params.entityId ?? null,
      context: params.context?.slice(0, 500) ?? null,
    })),
  );
}
