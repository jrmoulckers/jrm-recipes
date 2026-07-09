"use client";

import * as React from "react";
import { EyeOff, ShieldCheck, MessageSquare, NotebookPen, CookingPot } from "lucide-react";

import {
  dismissReportAction,
  hideContentAction,
} from "~/server/moderation/actions";
import type {
  ModerationQueueItem,
  ModerationQueue,
} from "~/server/moderation/queries";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useServerAction } from "~/lib/use-server-action";

const TARGET_META: Record<
  ModerationQueueItem["targetType"],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  comment: { label: "Comment", icon: MessageSquare },
  review: { label: "Review", icon: NotebookPen },
  cook_log: { label: "Cook post", icon: CookingPot },
};

const REASON_LABEL: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  inappropriate: "Inappropriate",
  other: "Other",
};

function QueueRow({
  groupSlug,
  item,
}: {
  groupSlug: string;
  item: ModerationQueueItem;
}) {
  const hide = useServerAction(hideContentAction, {
    successToast: "Hidden from members.",
    errorToast: true,
    refresh: true,
  });
  const dismiss = useServerAction(dismissReportAction, {
    successToast: "Reports dismissed.",
    errorToast: true,
    refresh: true,
  });
  const pending = hide.pending || dismiss.pending;

  const meta = TARGET_META[item.targetType];
  const Icon = meta.icon;
  const authorName = item.author?.name ?? item.author?.handle ?? "A member";

  return (
    <li className="rounded-xl border border-border bg-card p-4 shadow-token">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="muted" className="gap-1">
          <Icon className="size-3" />
          {meta.label}
        </Badge>
        <Badge variant="destructive">
          {item.reportCount} {item.reportCount === 1 ? "report" : "reports"}
        </Badge>
        {item.hidden ? (
          <Badge variant="secondary" className="gap-1">
            <EyeOff className="size-3" /> Hidden
          </Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">by {authorName}</span>
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm text-foreground">
        {item.preview}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.reasons.map((reason) => (
          <Badge key={reason} variant="outline">
            {REASON_LABEL[reason] ?? reason}
          </Badge>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!item.hidden ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              hide.run({
                targetType: item.targetType,
                targetId: item.targetId,
                groupSlug,
              })
            }
          >
            <EyeOff /> Hide from members
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            dismiss.run({
              targetType: item.targetType,
              targetId: item.targetId,
              groupSlug,
            })
          }
        >
          <ShieldCheck /> Dismiss {item.hidden ? "reports" : "— it's fine"}
        </Button>
      </div>
    </li>
  );
}

/**
 * The group moderation queue (issue #357): open reports aggregated by target,
 * with Hide / Dismiss actions for owners and admins.
 */
export function ModerationQueue({ queue }: { queue: ModerationQueue }) {
  if (queue.items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-10 text-center text-muted-foreground">
        <ShieldCheck className="mx-auto mb-2 size-7" aria-hidden="true" />
        <p className="font-medium text-foreground">Nothing to review</p>
        <p className="mt-1 text-sm">
          When a member reports a comment, review, or cook post, it shows up
          here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {queue.items.map((item) => (
        <QueueRow
          key={`${item.targetType}:${item.targetId}`}
          groupSlug={queue.groupSlug}
          item={item}
        />
      ))}
    </ul>
  );
}
