"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";
import { formatPlanWarnings } from "~/lib/plan-safety-copy";

import { buildListFromPlanAction } from "~/server/shopping/actions";
import { Button } from "~/components/ui/button";

/**
 * "Build shopping list" gathers every recipe planned in the visible week and
 * consolidates their ingredients onto the user's shopping list (#361). Re-runs
 * merge into the existing list rather than duplicating, and reports what was
 * added vs. merged so the shopper knows the list grew.
 */
export function BuildShoppingListButton({
  week,
  groupId,
}: {
  week: string;
  groupId?: string;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("planner.shoppingList");
  const [isPending, startTransition] = React.useTransition();

  function build() {
    startTransition(async () => {
      const result = await buildListFromPlanAction({ week, groupId });
      if (!result.ok) {
        toast.error(friendlyError(result.error));
        return;
      }
      if (result.empty) {
        toast.info(t("toast.emptyWeek"));
        return;
      }
      const warning = formatPlanWarnings(result.warnings, locale);
      if (warning) {
        toast.warning(warning);
      }
      if (result.added === 0 && result.merged === 0) {
        toast.info(t("toast.alreadyReady"));
        return;
      }
      const parts: string[] = [];
      if (result.added > 0) {
        parts.push(t("toast.addedItems", { count: result.added }));
      }
      if (result.merged > 0) {
        parts.push(t("toast.mergedItems", { count: result.merged }));
      }
      toast.success(t("toast.ready", { summary: parts.join(", ") }), {
        action: {
          label: t("toast.viewList"),
          onClick: () => router.push("/shopping"),
        },
      });
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={build}
      disabled={isPending}
    >
      <ShoppingCart />
      {isPending ? t("button.building") : t("button.default")}
    </Button>
  );
}
