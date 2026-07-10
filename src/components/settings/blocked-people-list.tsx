"use client";

import * as React from "react";
import { UserX } from "lucide-react";

import { unblockUserAction } from "~/server/moderation/actions";
import type { BlockedPerson } from "~/server/moderation/blocks";
import { Button } from "~/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { useServerAction } from "~/lib/use-server-action";

function personName(person: BlockedPerson) {
  return person.name ?? person.handle ?? "Family cook";
}

/**
 * The "Blocked people" settings list (issue #355). Each row shows a blocked
 * member with an Unblock button; unblocking refreshes the server-rendered list.
 */
export function BlockedPeopleList({ people }: { people: BlockedPerson[] }) {
  const unblock = useServerAction(unblockUserAction, {
    successToast: "Unblocked. Their posts will show again.",
    errorToast: true,
    refresh: true,
  });

  if (people.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
        <UserX className="mx-auto mb-2 size-6" aria-hidden="true" />
        <p>You haven&apos;t blocked anyone.</p>
        <p className="mt-1 text-sm">
          Block someone from the menu on their comment or review to hide their
          posts from you.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {people.map((person) => {
        const name = personName(person);
        return (
          <li
            key={person.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-token"
          >
            <Avatar className="size-9">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={unblock.pending}
              onClick={() => unblock.run({ blockedId: person.id })}
            >
              Unblock
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
