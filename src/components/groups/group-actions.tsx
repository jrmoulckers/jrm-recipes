"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
}: {
  slug: string;
  groupName: string;
  viewerRole: DisplayRole | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"leave" | "delete" | null>(null);
  const [isPending, startTransition] = React.useTransition();

  if (!viewerRole) return null;

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
            toast.error(result.error);
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
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          if (!window.confirm(`Leave ${groupName}?`)) return;
          run("leave", () => leaveGroupAction(slug), "You left the group.");
        }}
        disabled={isPending}
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
            run("delete", () => deleteGroupAction(slug), "The group was deleted.");
          }}
          disabled={isPending}
        >
          <Trash2 />
          {pending === "delete" ? "Deleting…" : "Delete group"}
        </Button>
      ) : null}
    </div>
  );
}
