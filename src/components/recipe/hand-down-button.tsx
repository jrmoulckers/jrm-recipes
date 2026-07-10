"use client";

import * as React from "react";
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
 * access is still governed by the recipe's own visibility — for an unlisted
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
      toast.success("Keepsake link copied — ready to give as a gift");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  function openPreview() {
    window.open(keepsakeUrl(), "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Gift /> Hand down
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hand this recipe down</DialogTitle>
          <DialogDescription>
            Add a personal message and share it as a warm keepsake — a little
            gift, not just a link.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="keepsake-from">Your name</Label>
            <Input
              id="keepsake-from"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              placeholder="Nonna"
              maxLength={80}
              autoComplete="name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="keepsake-note">Your message</Label>
            <Textarea
              id="keepsake-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="The one you loved as a girl. Love, Nonna."
              rows={4}
              maxLength={KEEPSAKE_NOTE_MAX}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" onClick={() => void copyLink()}>
            <Copy /> Copy keepsake link
          </Button>
          <Button type="button" variant="outline" onClick={openPreview}>
            <ExternalLink /> Preview
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Done
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
