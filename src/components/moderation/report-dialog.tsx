"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { reportContentAction } from "~/server/moderation/actions";
import { useFriendlyError } from "~/lib/error-copy";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

export type ReportTargetType = "comment" | "review" | "cook_log";

type Reason = "spam" | "harassment" | "inappropriate" | "other";

const REASONS: Reason[] = ["inappropriate", "harassment", "spam", "other"];

/**
 * Report dialog (issue #356): a reason picker + optional detail. Files a report
 * to the group's owners/admins and shows the reporter a confirmation. Controlled
 * by a parent (the content actions menu) via `open`/`onOpenChange`.
 */
export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportTargetType;
  targetId: string;
}) {
  const [reason, setReason] = React.useState<Reason>("inappropriate");
  const [detail, setDetail] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const t = useTranslations("moderation.report");
  const friendlyError = useFriendlyError();

  const submit = () => {
    startTransition(async () => {
      const result = await reportContentAction({
        targetType,
        targetId,
        reason,
        detail: detail.trim() || undefined,
      });
      if (result.ok) {
        toast.success(t("toasts.sent"));
        onOpenChange(false);
        setDetail("");
        setReason("inappropriate");
        return;
      }
      toast.error(friendlyError(result.error));
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t("reasonLegend")}</legend>
          {REASONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setReason(option)}
              aria-pressed={reason === option}
              className={cn(
                "flex flex-col rounded-lg border px-3 py-2 text-start transition-colors",
                reason === option
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted",
              )}
            >
              <span className="text-sm font-medium">
                {t(`reasons.${option}.label`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`reasons.${option}.hint`)}
              </span>
            </button>
          ))}
        </fieldset>

        <Textarea
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={t("detailPlaceholder")}
          disabled={pending}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("cancel")}
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Flag className="size-4" />
            )}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
