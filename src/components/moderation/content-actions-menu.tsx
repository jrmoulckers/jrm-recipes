"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Flag, MoreHorizontal, Trash2, UserX } from "lucide-react";
import { toast } from "sonner";

import { blockUserAction } from "~/server/moderation/actions";
import { useFriendlyError } from "~/lib/error-copy";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { ReportDialog, type ReportTargetType } from "./report-dialog";

/**
 * The overflow menu shared by comments, reviews, and cook posts (#355/#356).
 * Bundles the safety actions: Report content and Block author, with an
 * optional Delete slot. Report/Block only appear for a signed-in viewer acting
 * on someone else's content.
 */
export function ContentActionsMenu({
  targetType,
  targetId,
  authorId,
  authorName,
  currentUserId,
  canDelete = false,
  onDelete,
  disabled = false,
}: {
  targetType: ReportTargetType;
  targetId: string;
  authorId: string | null;
  authorName: string;
  currentUserId: string | null;
  canDelete?: boolean;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  const [reportOpen, setReportOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const t = useTranslations("moderation");
  const friendlyError = useFriendlyError();

  const isOwnContent = authorId != null && authorId === currentUserId;
  const canModerate =
    currentUserId != null && !isOwnContent && authorId != null;
  const showMenu = canDelete || canModerate;
  if (!showMenu) return null;

  const block = () => {
    if (!authorId) return;
    startTransition(async () => {
      const result = await blockUserAction({ blockedId: authorId });
      if (result.ok) {
        toast.success(t("toasts.blocked", { name: authorName }));
        return;
      }
      toast.error(friendlyError(result.error));
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || pending}
            aria-label={t("actions.more")}
            className="ms-auto size-8 text-muted-foreground"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canModerate ? (
            <DropdownMenuItem onSelect={() => setReportOpen(true)}>
              <Flag /> {t("actions.report")}
            </DropdownMenuItem>
          ) : null}
          {canModerate ? (
            <DropdownMenuItem onSelect={block}>
              <UserX /> {t("actions.block", { name: authorName })}
            </DropdownMenuItem>
          ) : null}
          {canDelete && onDelete ? (
            <>
              {canModerate ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 /> {t("actions.delete")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType={targetType}
        targetId={targetId}
      />
    </>
  );
}
