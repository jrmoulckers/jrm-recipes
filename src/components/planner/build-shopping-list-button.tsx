"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { buildListFromPlanAction } from "~/server/shopping/actions";
import { Button } from "~/components/ui/button";

/**
 * "Build shopping list" — gathers every recipe planned in the visible week and
 * consolidates their ingredients onto the user's shopping list (#361). Re-runs
 * merge into the existing list rather than duplicating, and reports what was
 * added vs. merged so the shopper knows the list grew.
 */
export function BuildShoppingListButton({ week }: { week: string }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function build() {
    startTransition(async () => {
      const result = await buildListFromPlanAction(week);
      if (!result.ok) {
        toast.error(friendlyError(result.error));
        return;
      }
      if (result.empty) {
        toast.info("No recipes planned this week yet — add some meals first.");
        return;
      }
      if (result.added === 0 && result.merged === 0) {
        toast.info("Everything from this week's recipes is already on your list.");
        return;
      }
      const parts: string[] = [];
      if (result.added > 0) {
        parts.push(`added ${result.added} ${result.added === 1 ? "item" : "items"}`);
      }
      if (result.merged > 0) {
        parts.push(`merged ${result.merged}`);
      }
      toast.success(`Shopping list ready — ${parts.join(", ")}.`, {
        action: {
          label: "View list",
          onClick: () => router.push("/shopping"),
        },
      });
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" onClick={build} disabled={isPending}>
      <ShoppingCart />
      {isPending ? "Building…" : "Build shopping list"}
    </Button>
  );
}
