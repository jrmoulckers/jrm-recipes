"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { deleteGroupAction, leaveGroupAction } from "~/server/groups/actions";
import { Button } from "~/components/ui/button";
import { useConfirm } from "~/components/ui/confirm-dialog";
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
  const t = useTranslations("groups.actions");
  const [pending, setPending] = React.useState<"leave" | "delete" | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const confirm = useConfirm();

  if (!viewerRole) return null;

  const soleOwnerNote = t("soleOwnerNote");

  function run(
    kind: "leave" | "delete",
    action: () => Promise<
      { ok: true; slug?: string } | { ok: false; error: string }
    >,
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
          onClick={async () => {
            if (isSoleOwner) return;
            const ok = await confirm({
              title: t("confirm.leave.title", { group: groupName }),
              description: t("confirm.leave.description"),
              confirmLabel: t("confirm.leave.confirmLabel"),
            });
            if (!ok) return;
            run("leave", () => leaveGroupAction(slug), t("toast.left"));
          }}
          disabled={isPending || isSoleOwner}
          title={isSoleOwner ? soleOwnerNote : undefined}
          aria-disabled={isSoleOwner}
        >
          <LogOut />
          {pending === "leave" ? t("leaving") : t("leave")}
        </Button>
        {viewerRole === "owner" ? (
          <Button
            type="button"
            variant="destructive"
            onClick={async () => {
              const ok = await confirm({
                title: t("confirm.delete.title", { group: groupName }),
                description: t("confirm.delete.description"),
                confirmLabel: t("confirm.delete.confirmLabel"),
              });
              if (!ok) return;
              run("delete", () => deleteGroupAction(slug), t("toast.deleted"));
            }}
            disabled={isPending}
          >
            <Trash2 />
            {pending === "delete" ? t("deleting") : t("delete")}
          </Button>
        ) : null}
      </div>
      {isSoleOwner ? (
        <p className="text-sm text-muted-foreground">{soleOwnerNote}</p>
      ) : null}
    </div>
  );
}
