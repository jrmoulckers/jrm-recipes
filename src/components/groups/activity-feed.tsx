"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookPlus,
  CookingPot,
  Lightbulb,
  MessageCircle,
  Star,
  UserPlus,
} from "lucide-react";

import type { ActivityEvent, ActivityKind } from "~/server/activity/queries";
import { loadGroupActivityAction } from "~/server/activity/actions";
import { formatRelativeTime } from "~/lib/dates";
import { useServerAction } from "~/lib/use-server-action";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";

const KIND_ICON: Record<
  ActivityKind,
  React.ComponentType<{ className?: string }>
> = {
  recipe_added: BookPlus,
  cook_shared: CookingPot,
  review: Star,
  comment: MessageCircle,
  suggestion: Lightbulb,
  member_joined: UserPlus,
};

function actorName(event: ActivityEvent) {
  return event.actor?.name ?? event.actor?.handle ?? "A family cook";
}

/** The lead sentence for an event, e.g. "Grandma cooked Sunday Ragù". */
function headline(event: ActivityEvent): React.ReactNode {
  const who = <span className="font-medium text-foreground">{actorName(event)}</span>;
  const recipe = event.recipe ? (
    <Link
      href={`/recipes/${event.recipe.slug}`}
      className="font-medium text-foreground underline-offset-2 hover:underline"
    >
      {event.recipe.title}
    </Link>
  ) : null;

  switch (event.kind) {
    case "recipe_added":
      return <>{who} added {recipe}</>;
    case "cook_shared":
      return <>{who} cooked {recipe}</>;
    case "review":
      return <>{who} reviewed {recipe}</>;
    case "comment":
      return <>{who} commented on {recipe}</>;
    case "suggestion":
      return <>{who} suggested an edit to {recipe}</>;
    case "member_joined":
      return <>{who} joined the family</>;
  }
}

function EventRow({ event }: { event: ActivityEvent }) {
  const Icon = KIND_ICON[event.kind];
  const name = actorName(event);
  return (
    <li className="flex gap-3 py-4">
      <div className="relative">
        <Avatar className="size-9">
          {event.actor?.avatarUrl ? (
            <AvatarImage src={event.actor.avatarUrl} alt={name} />
          ) : null}
          <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-1 -end-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Icon className="size-2.5" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-6 text-muted-foreground">
          {headline(event)}
        </p>
        {event.kind === "review" && event.rating != null ? (
          <span className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-amber-500">
            {Array.from({ length: event.rating }).map((_, i) => (
              <Star key={i} className="size-3 fill-amber-400 text-amber-400" />
            ))}
          </span>
        ) : null}
        {event.text ? (
          <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-foreground">
            {event.text}
          </p>
        ) : null}
        {event.kind === "cook_shared" && event.photoUrl ? (
          <figure className="mt-2 overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- member-supplied URL can't be pre-allowlisted for next/image */}
            <img
              src={event.photoUrl}
              alt={`${name}'s cook`}
              className="max-h-56 w-full object-cover"
            />
          </figure>
        ) : null}
        <time className="mt-1 block text-xs text-muted-foreground">
          {formatRelativeTime(new Date(event.at))}
        </time>
      </div>
    </li>
  );
}

/**
 * The family activity feed (issue #349): warm, reverse-chronological events with
 * "load older" cursor pagination.
 */
export function ActivityFeed({
  groupId,
  initialEvents,
  initialCursor,
}: {
  groupId: string;
  initialEvents: ActivityEvent[];
  initialCursor: string | null;
}) {
  const [events, setEvents] = React.useState(initialEvents);
  const [cursor, setCursor] = React.useState(initialCursor);

  const loadMore = useServerAction(loadGroupActivityAction, {
    errorToast: true,
    onSuccess: (result) => {
      setEvents((prev) => [...prev, ...result.events]);
      setCursor(result.nextCursor);
    },
  });

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
        <CookingPot className="mx-auto mb-2 size-6" aria-hidden="true" />
        <p className="font-medium text-foreground">No activity yet</p>
        <p className="mt-1 text-sm">
          Add a recipe, cook something, or leave a review — it&apos;ll show up
          here for the family.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-token sm:p-5">
      <ul className="divide-y divide-border">
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </ul>
      {cursor ? (
        <div className="mt-2 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadMore.run({ groupId, before: cursor })}
            disabled={loadMore.pending}
          >
            {loadMore.pending ? "Loading…" : "Load older"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
