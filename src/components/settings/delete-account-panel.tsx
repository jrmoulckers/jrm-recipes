"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { deleteAccountAction } from "~/server/users/actions";
import { DELETION_CONFIRM_PHRASE } from "~/server/users/deletion-notice";
import type { DeletionPreview } from "~/server/users/deletion-preview";

/**
 * The pre-confirmation deletion notice (issue #678, PR B).
 *
 * Structured so the notice is *read*, not dismissed. Three deliberate choices:
 *
 * - The consequences are rendered before the control that performs them, and
 *   the control is disabled until the phrase matches. There is no way to reach
 *   the button without scrolling past what it does.
 * - The counts are this account's, not the feature's. "Delete 214 recipes" is a
 *   decision the reader can check; "delete your data" is not.
 * - The export link sits inside the notice rather than elsewhere in settings,
 *   because the moment someone decides to leave is the only moment the offer
 *   is useful.
 *
 * The two-step reveal is not a dark pattern in reverse: erasure is irreversible
 * and instantaneous, so a misclick has no remedy at all.
 */
export function DeleteAccountPanel({ preview }: { preview: DeletionPreview }) {
  const t = useTranslations("settings.dataPage.delete");
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [phrase, setPhrase] = React.useState("");
  const [isPending, startTransition] = React.useTransition();

  const matches =
    phrase.trim().toUpperCase() === DELETION_CONFIRM_PHRASE.toUpperCase();

  function handleDelete() {
    if (!matches || isPending) return;
    startTransition(async () => {
      const result = await deleteAccountAction(phrase);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("toasts.deleted"));
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <section className="max-w-2xl rounded-2xl border border-destructive/40 bg-card p-8 shadow-token">
      <div className="flex items-start gap-4">
        <span className="bg-destructive/12 inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-destructive">
          <Trash2 className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface/40 p-5">
        <h3 className="text-sm font-semibold">{t("consequences.title")}</h3>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
          <li>
            {t("consequences.recipes", { count: preview.ownedRecipeCount })}
          </li>
          <li>
            {t("consequences.cooking", {
              cookLogs: preview.cookLogEntryCount,
              reviews: preview.reviewCount,
              collections: preview.collectionCount,
            })}
          </li>
          <li>{t("consequences.photos")}</li>
          {preview.coCreatedRecipeCount > 0 ? (
            <li className="text-foreground">
              {t("consequences.coCreated", {
                count: preview.coCreatedRecipeCount,
              })}
            </li>
          ) : null}
          {preview.pendingInviteCount > 0 ? (
            <li>
              {t("consequences.pendingInvites", {
                count: preview.pendingInviteCount,
              })}
            </li>
          ) : null}
          {preview.hasActiveSubscription ? (
            <li className="text-foreground">
              {t("consequences.subscription")}
            </li>
          ) : null}
          <li>{t("consequences.links")}</li>
          <li>{t("consequences.irreversible")}</li>
        </ul>

        {preview.soleOwnerGroups.length > 0 ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-warning-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 text-sm">
              <p className="font-medium">{t("groups.title")}</p>
              <p className="mt-1 text-muted-foreground">
                {t("groups.body", {
                  groups: preview.soleOwnerGroups
                    .map((group) => group.name)
                    .join(", "),
                })}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t("export.body")}</p>
        <a
          href="/api/backup"
          className={buttonVariants({
            variant: "outline",
            className: "w-full sm:w-auto",
          })}
          download
        >
          <Download className="size-4" aria-hidden="true" />
          {t("export.cta")}
        </a>
      </div>

      {!confirmOpen ? (
        <Button
          variant="destructive"
          className="mt-6 w-full sm:w-auto"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {t("start")}
        </Button>
      ) : (
        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
          <Label htmlFor="delete-confirm">
            {t("confirm.label", { phrase: DELETION_CONFIRM_PHRASE })}
          </Label>
          <Input
            id="delete-confirm"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="delete-confirm-help"
            className="max-w-xs"
          />
          <p id="delete-confirm-help" className="text-xs text-muted-foreground">
            {t("confirm.help")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="destructive"
              disabled={!matches || isPending}
              onClick={handleDelete}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              {t("confirm.cta")}
            </Button>
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                setConfirmOpen(false);
                setPhrase("");
              }}
            >
              {t("confirm.cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
