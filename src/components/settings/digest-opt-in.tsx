"use client";

import * as React from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "~/components/ui/switch";
import { setWeeklyDigestOptInAction } from "~/server/digest/actions";

/**
 * Weekly-digest opt-in toggle (issue #354). Optimistic switch backed by
 * {@link setWeeklyDigestOptInAction}; reverts + toasts on failure. Default off.
 */
export function DigestOptIn({ defaultOptedIn }: { defaultOptedIn: boolean }) {
  const [optedIn, setOptedIn] = React.useState(defaultOptedIn);
  const [isPending, startTransition] = React.useTransition();

  function handleChange(next: boolean) {
    const previous = optedIn;
    setOptedIn(next);
    startTransition(async () => {
      const result = await setWeeklyDigestOptInAction(next);
      if (!result.ok) {
        setOptedIn(previous);
        toast.error(result.error);
        return;
      }
      toast.success(
        next
          ? "You're subscribed to the weekly family digest"
          : "You've unsubscribed from the weekly family digest",
      );
    });
  }

  return (
    <section className="flex items-start gap-3 rounded-xl border border-border bg-surface/40 p-4">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <Mail className="size-5" aria-hidden="true" />
      </span>
      <label
        htmlFor="weekly-digest"
        className="min-w-0 flex-1 cursor-pointer select-none"
      >
        <span className="block text-sm font-medium">Weekly family digest</span>
        <span className="block text-xs text-muted-foreground">
          A once-a-week email with new and updated recipes across your family
          groups. No spam, unsubscribe anytime.
        </span>
      </label>
      <Switch
        id="weekly-digest"
        checked={optedIn}
        disabled={isPending}
        onCheckedChange={handleChange}
      />
    </section>
  );
}
