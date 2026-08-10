"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import { friendlyError } from "~/lib/error-copy";
import {
  acceptRecipeCreatorAction,
  declineRecipeCreatorAction,
} from "~/server/recipes/creators-actions";
import { Button } from "~/components/ui/button";

/** A pending invitation as shown to the invitee. */
export type CreatorInviteEntry = {
  recipeId: string;
  title: string;
  ownerName: string | null;
};

/**
 * Accept/decline controls for pending co-creator invitations (issue #668).
 *
 * These deliberately live on their own page rather than on the recipe: a
 * pending invitee cannot see the recipe yet, so the recipe page 404s for them.
 * The invitation itself is the only thing they are entitled to see, and the
 * title and inviter shown here are exactly what the owner chose to disclose by
 * sending it.
 */
export function CreatorInviteList({
  invites,
}: {
  invites: CreatorInviteEntry[];
}) {
  const t = useTranslations("recipeCreators.invites");
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function respond(recipeId: string, accept: boolean) {
    startTransition(() => {
      const run = accept
        ? acceptRecipeCreatorAction({ recipeId })
        : declineRecipeCreatorAction({ recipeId });
      void run.then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(accept ? t("toast.accepted") : t("toast.declined"));
        router.refresh();
      });
    });
  }

  if (invites.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="grid gap-3">
      {invites.map((invite) => (
        <li
          key={invite.recipeId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {invite.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("from", { name: invite.ownerName ?? t("someone") })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={() => respond(invite.recipeId, true)}
            >
              <Check aria-hidden />
              {t("accept")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => respond(invite.recipeId, false)}
            >
              <X aria-hidden />
              {t("decline")}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
