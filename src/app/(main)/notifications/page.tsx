import { type Metadata } from "next";
import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listNotifications } from "~/server/notifications/queries";
import { NotificationInbox } from "~/components/notifications/notification-inbox";
import { EmptyState } from "~/components/ui/empty-state";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("notifications.title") };
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  const t = await getTranslations("notifications.page");

  if (isAuthConfigured() && isDbConfigured() && !user) {
    return (
      <div className="container py-10">
        <EmptyState
          icon={<Bell />}
          title={t("signIn.title")}
          description={t("signIn.body")}
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
          {t("title")}
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          {t("description")}
        </p>
      </header>
      <NotificationInbox
        initialItems={page.items}
        initialCursor={page.nextCursor}
      />
    </div>
  );
}
