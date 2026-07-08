"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CopyPlus } from "lucide-react";
import { toast } from "sonner";

import { copyPreviousWeekAction } from "~/server/planner/actions";
import { Button } from "~/components/ui/button";

/**
 * "Copy last week" — re-creates the previous week's entries on the matching
 * days/slots of the week being viewed, filling only empty cells (#434). Most
 * weeks are ~80% the same, so this turns Sunday's re-planning into one tap.
 */
export function CopyLastWeekButton({ week }: { week: string }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function copy() {
    startTransition(async () => {
      const result = await copyPreviousWeekAction({ week });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.previousEmpty) {
        toast.info("Last week was empty — nothing to copy yet.");
        return;
      }
      if (result.copied === 0) {
        toast.info("This week is already full — nothing new to copy.");
        return;
      }
      toast.success(
        `Copied ${result.copied} ${
          result.copied === 1 ? "meal" : "meals"
        } from last week`,
      );
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" onClick={copy} disabled={isPending}>
      <CopyPlus />
      {isPending ? "Copying…" : "Copy last week"}
    </Button>
  );
}
