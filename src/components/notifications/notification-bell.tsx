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
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "~/server/notifications/actions";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

type Props = {
  initialCount: number;
  initialItems: NotificationItem[];
};

/**
 * Header bell (#348): shows an unread badge and a dropdown of recent social
 * events. Marking one read (or "Mark all as read") updates the badge
 * optimistically and refreshes the server data behind the popover.
 */
export function NotificationBell({ initialCount, initialItems }: Props) {
  const [count, setCount] = React.useState(initialCount);
  const [items, setItems] = React.useState(initialItems);

  React.useEffect(() => setCount(initialCount), [initialCount]);
  React.useEffect(() => setItems(initialItems), [initialItems]);

  const markOne = useServerAction(markNotificationReadAction, {
    refresh: true,
  });
  const markAll = useServerAction(markAllNotificationsReadAction, {
    refresh: true,
  });

  const onOpenItem = (item: NotificationItem) => {
    if (item.readAt) return;
    setItems((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date() } : n)),
    );
    setCount((c) => Math.max(0, c - 1));
    markOne.run({ notificationId: item.id });
  };

  const onMarkAll = () => {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })),
    );
    setCount(0);
    markAll.run({});
  };

  const badge = count > 99 ? "99+" : String(count);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            count > 0 ? `Notifications, ${count} unread` : "Notifications"
          }
        >
          <Bell className="size-5" aria-hidden />
          {count > 0 ? (
            <span
              className="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
              aria-hidden
            >
              {badge}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={onMarkAll}
              disabled={markAll.pending}
            >
              Mark all as read
            </Button>
          ) : null}
        </div>
        <Separator />
        <div className="max-h-96 overflow-y-auto py-1">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="flex flex-col">
              {items.map((item) => {
                const sentence = notificationSentence(
                  item.type,
                  item.actor?.name ?? item.actor?.handle ?? "Someone",
                  item.context,
                );
                const body = (
                  <>
                    <span className="flex-1">
                      <span className="block text-sm text-foreground">
                        {sentence}
                      </span>
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
                  "flex items-start gap-2 px-3 py-2 text-start transition-colors hover:bg-muted/60",
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
          )}
        </div>
        <Separator />
        <Link
          href="/notifications"
          className="block px-3 py-2 text-center text-sm font-medium text-primary hover:underline"
        >
          View all
        </Link>
      </PopoverContent>
    </Popover>
  );
}
