import * as React from "react";

import { getAuthState } from "~/server/auth";
import {
  getUnreadCount,
  listNotifications,
} from "~/server/notifications/queries";
import { NotificationBell } from "./notification-bell";

/**
 * Server wrapper for the header bell (#348): resolves the current user, loads
 * the unread count + latest notifications, and hands them to the client bell.
 * Renders nothing for signed-out visitors.
 */
export async function NotificationBellServer() {
  const { user } = await getAuthState();
  if (!user) return null;

  const [count, page] = await Promise.all([
    getUnreadCount(user.id),
    listNotifications(user.id, { limit: 8 }),
  ]);

  return <NotificationBell initialCount={count} initialItems={page.items} />;
}
