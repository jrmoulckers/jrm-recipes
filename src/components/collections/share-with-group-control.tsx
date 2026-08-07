"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, Users } from "lucide-react";
import { toast } from "sonner";

import { friendlyError } from "~/lib/error-copy";
import {
  shareCollectionWithGroupAction,
  unshareCollectionWithGroupAction,
} from "~/server/collections/actions";
import { type CollectionShareTarget } from "~/server/collections/queries";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

/**
 * Owner-only control to share a collection with the family groups they belong
 * to (issue #365). Toggling a group shares/unshares it and refreshes so the
 * "Shared with {group}" badges stay in sync.
 */
export function ShareWithGroupControl({
  collectionId,
  groups,
}: {
  collectionId: string;
  groups: CollectionShareTarget[];
}) {
  const router = useRouter();
  const t = useTranslations("collections.shareWithGroup");
  const [shared, setShared] = React.useState(
    () => new Set(groups.filter((g) => g.shared).map((g) => g.id)),
  );
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const sharedCount = shared.size;

  function toggle(groupId: string) {
    const wasShared = shared.has(groupId);
    const next = new Set(shared);
    if (wasShared) next.delete(groupId);
    else next.add(groupId);
    setShared(next);
    setPendingId(groupId);

    const action = wasShared
      ? unshareCollectionWithGroupAction
      : shareCollectionWithGroupAction;

    startTransition(() => {
      void action({ collectionId, groupId }).then((result) => {
        setPendingId(null);
        if (!result.ok) {
          // Roll back the optimistic change.
          setShared((current) => {
            const rolledBack = new Set(current);
            if (wasShared) rolledBack.add(groupId);
            else rolledBack.delete(groupId);
            return rolledBack;
          });
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(
          wasShared ? t("toast.stoppedSharing") : t("toast.shared"),
        );
        router.refresh();
      });
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <Users />
          {sharedCount > 0
            ? t("triggerWithCount", { count: sharedCount })
            : t("trigger")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t("title")}</p>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
        {groups.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {groups.map((group) => {
              const isShared = shared.has(group.id);
              return (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    disabled={pendingId === group.id}
                    aria-pressed={isShared}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-start text-sm hover:bg-muted disabled:opacity-60"
                  >
                    <span className="min-w-0 truncate">{group.name}</span>
                    <span
                      className={
                        isShared
                          ? "inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                          : "inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border"
                      }
                    >
                      {isShared ? <Check className="size-3.5" /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
