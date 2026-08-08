"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CopyPlus } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { copyPreviousWeekAction } from "~/server/planner/actions";
import { Button } from "~/components/ui/button";

/**
 * "Copy last week" re-creates the previous week's entries on the matching
 * days/slots of the week being viewed, filling only empty cells (#434). Most
 * weeks are ~80% the same, so this turns Sunday's re-planning into one tap.
 */
export function CopyLastWeekButton({
  week,
  groupId,
}: {
  week: string;
  groupId?: string;
}) {
  const router = useRouter();
  const t = useTranslations("planner.copyLastWeek");
  const [isPending, startTransition] = React.useTransition();

  function copy() {
    startTransition(async () => {
      const result = await copyPreviousWeekAction({ week, groupId });
      if (!result.ok) {
        toast.error(friendlyError(result.error));
        return;
      }
      if (result.previousEmpty) {
        toast.info(t("toast.previousEmpty"));
        return;
      }
      if (result.copied === 0) {
        toast.info(t("toast.weekFull"));
        return;
      }
      toast.success(t("toast.copiedMeals", { count: result.copied }));
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" onClick={copy} disabled={isPending}>
      <CopyPlus />
      {isPending ? t("button.copying") : t("button.default")}
    </Button>
  );
}
