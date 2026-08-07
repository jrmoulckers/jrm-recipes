"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { Switch } from "~/components/ui/switch";
import { setWeeklyDigestOptInAction } from "~/server/digest/actions";

/**
 * Weekly-digest opt-in toggle (issue #354). Optimistic switch backed by
 * {@link setWeeklyDigestOptInAction}. Reverts + toasts on failure. Default off.
 */
export function DigestOptIn({ defaultOptedIn }: { defaultOptedIn: boolean }) {
  const t = useTranslations("settings.digest");
  const [optedIn, setOptedIn] = React.useState(defaultOptedIn);
  const [isPending, startTransition] = React.useTransition();

  function handleChange(next: boolean) {
    const previous = optedIn;
    setOptedIn(next);
    startTransition(async () => {
      const result = await setWeeklyDigestOptInAction(next);
      if (!result.ok) {
        setOptedIn(previous);
        toast.error(friendlyError(result.error));
        return;
      }
      toast.success(next ? t("toasts.subscribed") : t("toasts.unsubscribed"));
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
        <span className="block text-sm font-medium">{t("label")}</span>
        <span className="block text-xs text-muted-foreground">
          {t("description")}
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
