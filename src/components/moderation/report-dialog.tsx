"use client";

import * as React from "react";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { reportContentAction } from "~/server/moderation/actions";
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

const REASONS: { value: Reason; label: string; hint: string }[] = [
  {
    value: "inappropriate",
    label: "Inappropriate",
    hint: "Not right for a family space",
  },
  {
    value: "harassment",
    label: "Harassment",
    hint: "Targeting or bullying someone",
  },
  { value: "spam", label: "Spam", hint: "Off-topic or promotional" },
  { value: "other", label: "Something else", hint: "Tell us more below" },
];

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

  const submit = () => {
    startTransition(async () => {
      const result = await reportContentAction({
        targetType,
        targetId,
        reason,
        detail: detail.trim() || undefined,
      });
      if (result.ok) {
        toast.success("Thanks — this has been sent to the group's admins.");
        onOpenChange(false);
        setDetail("");
        setReason("inappropriate");
        return;
      }
      toast.error(result.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this</DialogTitle>
          <DialogDescription>
            Reports are private — only the group&apos;s owners and admins see
            them, never the other members.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Reason</legend>
          {REASONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setReason(option.value)}
              aria-pressed={reason === option.value}
              className={cn(
                "flex flex-col rounded-lg border px-3 py-2 text-start transition-colors",
                reason === option.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted",
              )}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">
                {option.hint}
              </span>
            </button>
          ))}
        </fieldset>

        <Textarea
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Add any detail (optional)"
          disabled={pending}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Flag className="size-4" />
            )}
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
