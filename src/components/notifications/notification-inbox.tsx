"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { cn } from "~/lib/utils";
import { formatRelativeTime } from "~/lib/dates";
import { notificationSentence } from "~/lib/notifications";
import { useServerAction } from "~/lib/use-server-action";
import type { NotificationItem } from "~/server/notifications/queries";
import {
  loadNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "~/server/notifications/actions";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";

type Props = {
  initialItems: NotificationItem[];
  initialCursor: string | null;
};

/** Full-page notification inbox (#348): the "View all" destination. */
export function NotificationInbox({ initialItems, initialCursor }: Props) {
  const [items, setItems] = React.useState(initialItems);
  const [cursor, setCursor] = React.useState(initialCursor);

  const markOne = useServerAction(markNotificationReadAction);
  const markAll = useServerAction(markAllNotificationsReadAction);
  const loadMore = useServerAction(loadNotificationsAction, {
    onSuccess: (result) => {
      setItems((prev) => [...prev, ...result.items]);
      setCursor(result.nextCursor);
    },
  });

  const unread = items.some((n) => !n.readAt);

  const onOpenItem = (item: NotificationItem) => {
    if (item.readAt) return;
    setItems((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date() } : n)),
    );
    markOne.run({ notificationId: item.id });
  };

  const onMarkAll = () => {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })),
    );
    markAll.run({});
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Bell />}
        title="No notifications yet"
        description="Mentions, replies, reviews, and cook-along invites will show up here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onMarkAll}
          disabled={!unread || markAll.pending}
        >
          Mark all as read
        </Button>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {items.map((item) => {
          const sentence = notificationSentence(
            item.type,
            item.actor?.name ?? item.actor?.handle ?? "Someone",
            item.context,
          );
          const body = (
            <>
              <span className="flex-1">
                <span className="block text-sm text-foreground">{sentence}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {formatRelativeTime(item.createdAt)}
                </span>
              </span>
              {!item.readAt ? (
                <span
                  className="mt-1 size-2 shrink-0 rounded-full bg-primary"
                  aria-label="Unread"
                />
              ) : null}
            </>
          );
          const rowClass = cn(
            "flex items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/60",
            !item.readAt && "bg-muted/30",
          );
          return (
            <li key={item.id}>
              {item.href ? (
                <Link
                  href={item.href}
                  className={rowClass}
                  onClick={() => onOpenItem(item)}
                >
                  {body}
                </Link>
              ) : (
                <button
                  type="button"
                  className={cn(rowClass, "w-full")}
                  onClick={() => onOpenItem(item)}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {cursor ? (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            onClick={() => loadMore.run({ cursor })}
            disabled={loadMore.pending}
          >
            {loadMore.pending ? "Loading…" : "Load older"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
