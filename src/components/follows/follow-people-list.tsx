"use client";

import * as React from "react";
import Link from "next/link";
import { Users } from "lucide-react";

import type { FollowPerson } from "~/server/follows/queries";
import {
  loadFollowersAction,
  loadFollowingAction,
} from "~/server/follows/actions";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { useServerAction } from "~/lib/use-server-action";

function personName(person: FollowPerson) {
  return person.name ?? (person.handle ? `@${person.handle}` : "A family cook");
}

function PersonRow({ person }: { person: FollowPerson }) {
  const name = personName(person);
  const row = (
    <div className="flex items-center gap-3">
      <Avatar className="size-10">
        {person.avatarUrl ? (
          <AvatarImage src={person.avatarUrl} alt={name} />
        ) : null}
        <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{name}</p>
        {person.handle ? (
          <p className="truncate text-xs text-muted-foreground">
            @{person.handle}
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <li className="rounded-xl border border-border bg-card p-3 shadow-token">
      {person.handle ? (
        <Link
          href={`/cooks/${person.handle}`}
          className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {row}
        </Link>
      ) : (
        row
      )}
    </li>
  );
}

/**
 * A followers / following list with cursor "load more". `direction` picks which
 * server action pages the next batch. Both re-check the target's opt-in server
 * side so a non-opted-in cook's graph is never enumerable.
 */
export function FollowPeopleList({
  userId,
  direction,
  initialPeople,
  initialCursor,
  emptyLabel,
}: {
  userId: string;
  direction: "followers" | "following";
  initialPeople: FollowPerson[];
  initialCursor: string | null;
  emptyLabel: string;
}) {
  const [people, setPeople] = React.useState(initialPeople);
  const [cursor, setCursor] = React.useState(initialCursor);

  const onSuccess = (result: {
    people: FollowPerson[];
    nextCursor: string | null;
  }) => {
    setPeople((prev) => [...prev, ...result.people]);
    setCursor(result.nextCursor);
  };

  const action =
    direction === "followers" ? loadFollowersAction : loadFollowingAction;
  const load = useServerAction(action, { errorToast: true, onSuccess });

  if (people.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
        <Users className="mx-auto mb-2 size-6" aria-hidden="true" />
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {people.map((person) => (
          <PersonRow key={person.id} person={person} />
        ))}
      </ul>
      {cursor ? (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={load.pending}
            onClick={() => load.run({ userId, before: cursor })}
          >
            {load.pending ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
