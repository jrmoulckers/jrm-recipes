import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "~/server/db";
import { notifications, type User } from "~/server/db/schema";

/** Mark one of the user's notifications read. No-op if it isn't theirs. */
export async function markNotificationRead(
  notificationId: string,
  user: User,
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientId, user.id),
        isNull(notifications.readAt),
      ),
    );
}

/** Mark every unread notification for the user as read. */
export async function markAllNotificationsRead(user: User): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.recipientId, user.id), isNull(notifications.readAt)),
    );
}
