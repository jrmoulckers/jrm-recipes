"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import {
  deleteGroupAction,
  leaveGroupAction,
} from "~/server/groups/actions";
import { Button } from "~/components/ui/button";
import { type DisplayRole } from "./role-badge";

export function GroupActions({
  slug,
  groupName,
  viewerRole,
  isSoleOwner = false,
}: {
  slug: string;
  groupName: string;
  viewerRole: DisplayRole | null;
  isSoleOwner?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"leave" | "delete" | null>(null);
  const [isPending, startTransition] = React.useTransition();

  if (!viewerRole) return null;

  const soleOwnerNote =
    "As the group's only owner, you can't leave. Transfer ownership to another member, or delete the group instead.";

  function run(
    kind: "leave" | "delete",
    action: () => Promise<{ ok: true; slug?: string } | { ok: false; error: string }>,
    success: string,
  ) {
    setPending(kind);
    startTransition(() => {
      void action()
        .then((result) => {
          if (!result.ok) {
            toast.error(friendlyError(result.error));
            return;
          }
          toast.success(success);
          router.push("/groups");
          router.refresh();
        })
        .finally(() => setPending(null));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (isSoleOwner) return;
            if (!window.confirm(`Leave ${groupName}?`)) return;
            run("leave", () => leaveGroupAction(slug), "You left the group");
          }}
          disabled={isPending || isSoleOwner}
          title={isSoleOwner ? soleOwnerNote : undefined}
          aria-disabled={isSoleOwner}
        >
          <LogOut />
          {pending === "leave" ? "Leaving…" : "Leave group"}
        </Button>
        {viewerRole === "owner" ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (
                !window.confirm(
                  `Delete ${groupName}? Recipes stay saved, but the group space will be removed.`,
                )
              ) {
                return;
              }
              run("delete", () => deleteGroupAction(slug), "The group was deleted");
            }}
            disabled={isPending}
          >
            <Trash2 />
            {pending === "delete" ? "Deleting…" : "Delete group"}
          </Button>
        ) : null}
      </div>
      {isSoleOwner ? (
        <p className="text-sm text-muted-foreground">{soleOwnerNote}</p>
      ) : null}
    </div>
  );
}
