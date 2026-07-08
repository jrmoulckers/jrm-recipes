import "server-only";

import { and, eq, gt, isNull, lte } from "drizzle-orm";

import { db } from "~/server/db";
import { DomainError } from "~/server/errors";
import { notifyMany } from "~/server/notifications/notify";
import {
  cookAlongRsvps,
  cookAlongs,
  groupMembers,
  recipes,
  type CookAlong,
  type User,
} from "~/server/db/schema";
import type {
  CreateCookAlongInput,
  RsvpInput,
  UpdateCookAlongInput,
} from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Look up a member row (role) for a user in a group, or null if not a member. */
async function memberRoleOf(
  exec: typeof db | Tx,
  groupId: string,
  userId: string,
): Promise<string | null> {
  const row = await exec.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, userId),
    ),
    columns: { role: true },
  });
  return row?.role ?? null;
}

/**
 * Schedule a new cook-along (issue #353). The host must be a member of the group
 * and the recipe must belong to that group's cookbook. Every other member is
 * invited via the notification center, and the host is auto-RSVP'd as "going".
 */
export async function createCookAlong(
  input: CreateCookAlongInput,
  user: User,
): Promise<CookAlong> {
  return db.transaction(async (tx: Tx) => {
    if (!(await memberRoleOf(tx, input.groupId, user.id))) {
      throw new DomainError("FORBIDDEN");
    }

    const recipe = await tx.query.recipes.findFirst({
      where: eq(recipes.id, input.recipeId),
      columns: { id: true, groupId: true, title: true },
    });
    if (!recipe || recipe.groupId !== input.groupId) {
      throw new DomainError("NOT_FOUND");
    }

    const [created] = await tx
      .insert(cookAlongs)
      .values({
        groupId: input.groupId,
        recipeId: input.recipeId,
        hostId: user.id,
        title: input.title ?? null,
        note: input.note ?? null,
        scheduledFor: input.scheduledFor,
      })
      .returning();

    // Host is going by default.
    await tx
      .insert(cookAlongRsvps)
      .values({ cookAlongId: created!.id, userId: user.id, status: "going" })
      .onConflictDoNothing();

    // Invite everyone else in the group.
    const members = await tx.query.groupMembers.findMany({
      where: eq(groupMembers.groupId, input.groupId),
      columns: { userId: true },
    });
    await notifyMany(
      tx,
      members.map((m) => m.userId),
      {
        actorId: user.id,
        type: "cook_along_invite",
        groupId: input.groupId,
        recipeId: input.recipeId,
        entityId: created!.id,
        context: input.title ?? recipe.title,
      },
    );

    return created!;
  });
}

/** Edit a cook-along's title/note/time (issue #353). Host or a group manager. */
export async function updateCookAlong(
  input: UpdateCookAlongInput,
  user: User,
): Promise<void> {
  await db.transaction(async (tx: Tx) => {
    const event = await tx.query.cookAlongs.findFirst({
      where: eq(cookAlongs.id, input.cookAlongId),
      columns: { id: true, groupId: true, hostId: true },
    });
    if (!event) throw new DomainError("NOT_FOUND");

    const role = await memberRoleOf(tx, event.groupId, user.id);
    const canEdit =
      event.hostId === user.id || role === "owner" || role === "admin";
    if (!canEdit) throw new DomainError("FORBIDDEN");

    await tx
      .update(cookAlongs)
      .set({
        title: input.title ?? null,
        note: input.note ?? null,
        scheduledFor: input.scheduledFor,
      })
      .where(eq(cookAlongs.id, input.cookAlongId));
  });
}

/** Cancel a cook-along (issue #353). Host or a group manager only. */
export async function deleteCookAlong(
  cookAlongId: string,
  user: User,
): Promise<void> {
  await db.transaction(async (tx: Tx) => {
    const event = await tx.query.cookAlongs.findFirst({
      where: eq(cookAlongs.id, cookAlongId),
      columns: { id: true, groupId: true, hostId: true },
    });
    if (!event) throw new DomainError("NOT_FOUND");

    const role = await memberRoleOf(tx, event.groupId, user.id);
    const canDelete =
      event.hostId === user.id || role === "owner" || role === "admin";
    if (!canDelete) throw new DomainError("FORBIDDEN");

    await tx.delete(cookAlongs).where(eq(cookAlongs.id, cookAlongId));
  });
}

/**
 * Record (or change) a member's RSVP to a cook-along (issue #353). The member
 * must belong to the event's group. Upserts on the unique (event, user) pair so
 * flipping going ↔ maybe ↔ declined never creates duplicates.
 */
export async function setRsvp(input: RsvpInput, user: User): Promise<void> {
  await db.transaction(async (tx: Tx) => {
    const event = await tx.query.cookAlongs.findFirst({
      where: eq(cookAlongs.id, input.cookAlongId),
      columns: { id: true, groupId: true, hostId: true },
    });
    if (!event) throw new DomainError("NOT_FOUND");
    if (!(await memberRoleOf(tx, event.groupId, user.id))) {
      throw new DomainError("FORBIDDEN");
    }

    await tx
      .insert(cookAlongRsvps)
      .values({
        cookAlongId: input.cookAlongId,
        userId: user.id,
        status: input.status,
      })
      .onConflictDoUpdate({
        target: [cookAlongRsvps.cookAlongId, cookAlongRsvps.userId],
        set: { status: input.status },
      });
  });
}

/**
 * Send reminder notifications for cook-alongs starting within `windowMs`
 * (issue #353). Idempotent: `reminderSentAt` is stamped so a reminder fires at
 * most once per event. Designed to be called from a scheduled job/route; it
 * only notifies members who RSVP'd going or maybe. Returns how many events were
 * reminded.
 */
export async function sendDueCookAlongReminders(
  windowMs = 2 * 60 * 60 * 1000,
  now: Date = new Date(),
): Promise<number> {
  const soon = new Date(now.getTime() + windowMs);
  const due = await db.query.cookAlongs.findMany({
    where: and(
      isNull(cookAlongs.reminderSentAt),
      gt(cookAlongs.scheduledFor, now),
      lte(cookAlongs.scheduledFor, soon),
    ),
    columns: {
      id: true,
      groupId: true,
      recipeId: true,
      hostId: true,
      title: true,
    },
    with: {
      recipe: { columns: { title: true } },
      rsvps: { columns: { userId: true, status: true } },
    },
  });

  let reminded = 0;
  for (const event of due) {
    const recipients = event.rsvps
      .filter((r) => r.status === "going" || r.status === "maybe")
      .map((r) => r.userId);
    await db.transaction(async (tx: Tx) => {
      // Re-check inside the tx to avoid double-sending under concurrency.
      const [claimed] = await tx
        .update(cookAlongs)
        .set({ reminderSentAt: now })
        .where(
          and(eq(cookAlongs.id, event.id), isNull(cookAlongs.reminderSentAt)),
        )
        .returning({ id: cookAlongs.id });
      if (!claimed) return;

      await notifyMany(tx, recipients, {
        actorId: event.hostId ?? null,
        type: "cook_along_reminder",
        groupId: event.groupId,
        recipeId: event.recipeId,
        entityId: event.id,
        context: event.title ?? event.recipe?.title ?? null,
      });
      reminded += 1;
    });
  }
  return reminded;
}
