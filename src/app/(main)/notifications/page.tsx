import { type Metadata } from "next";
import { Bell } from "lucide-react";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listNotifications } from "~/server/notifications/queries";
import { NotificationInbox } from "~/components/notifications/notification-inbox";
import { EmptyState } from "~/components/ui/empty-state";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await getCurrentUser();

  if (isAuthConfigured() && isDbConfigured() && !user) {
    return (
      <div className="container py-10">
        <EmptyState
          icon={<Bell />}
          title="Sign in to see notifications"
          description="Mentions, replies, reviews, and cook-along invites live here once you're signed in."
        />
      </div>
    );
  }

  const page = user
    ? await listNotifications(user.id, { limit: 20 })
    : { items: [], nextCursor: null };

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Notifications
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Everything happening around your recipes and family — mentions,
          replies, reviews, reactions, and cook-alongs.
        </p>
      </header>
      <NotificationInbox
        initialItems={page.items}
        initialCursor={page.nextCursor}
      />
    </div>
  );
}
