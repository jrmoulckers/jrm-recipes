"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Gift, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { buildKeepsakePath, KEEPSAKE_NOTE_MAX } from "~/lib/keepsake";

/**
 * "Hand this down" flow (issue #407). Lets an owner write a personal note and
 * turn a recipe into a warm keepsake link to give as a gift. The note + name
 * are carried in the keepsake URL (no server round-trip, nothing to store), and
 * access is still governed by the recipe's own visibility. For an unlisted
 * recipe the existing share `token` is threaded through so the recipient can
 * open it without an account, exactly like a normal share link.
 */
export function HandDownButton({
  slug,
  defaultFrom,
  token,
}: {
  slug: string;
  defaultFrom?: string | null;
  token?: string | null;
}) {
  const t = useTranslations("recipe");
  const [from, setFrom] = React.useState(defaultFrom ?? "");
  const [note, setNote] = React.useState("");

  function keepsakeUrl(): string {
    const path = buildKeepsakePath(slug, { from, note, token });
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${path}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(keepsakeUrl());
      toast.success(t("keepsake.toast.copied"));
    } catch {
      toast.error(t("share.toast.copyError"));
    }
  }

  function openPreview() {
    window.open(keepsakeUrl(), "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Gift /> {t("keepsake.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("keepsake.title")}</DialogTitle>
          <DialogDescription>
            {t("keepsake.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="keepsake-from">{t("keepsake.fromLabel")}</Label>
            <Input
              id="keepsake-from"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              placeholder={t("keepsake.fromPlaceholder")}
              maxLength={80}
              autoComplete="name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="keepsake-note">{t("keepsake.noteLabel")}</Label>
            <Textarea
              id="keepsake-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("keepsake.notePlaceholder")}
              rows={4}
              maxLength={KEEPSAKE_NOTE_MAX}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" onClick={() => void copyLink()}>
            <Copy /> {t("keepsake.copyLink")}
          </Button>
          <Button type="button" variant="outline" onClick={openPreview}>
            <ExternalLink /> {t("common.preview")}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {t("common.done")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
