"use client";

import * as React from "react";
import { Check, Copy, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { createInviteLinkAction } from "~/server/groups/actions";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

type LinkRole = "member" | "kid";

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never expires" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

/**
 * Manager-only "share an invite link" affordance (issue #343). Generates a
 * tokenized `/join/<token>` URL — role-scoped (member/kid) and optionally
 * expiring — that a non-user can open, sign up, and land straight into the
 * group. This is the acquisition loop `AddMemberForm` can't cover (that form
 * needs the invitee to already have an account).
 */
export function InviteLinkManager({ slug }: { slug: string }) {
  const [role, setRole] = React.useState<LinkRole>("member");
  const [expiry, setExpiry] = React.useState<string>("never");
  const [url, setUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  function generate() {
    startTransition(() => {
      const expiresInDays = expiry === "never" ? undefined : Number(expiry);
      void createInviteLinkAction(slug, { role, expiresInDays }).then(
        (result) => {
          if (!result.ok) {
            toast.error(friendlyError(result.error));
            return;
          }
          setUrl(result.url);
          setCopied(false);
          toast.success("Invite link ready to share");
        },
      );
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <Link2 /> Invite link
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Share a join link</p>
          <p className="text-xs text-muted-foreground">
            Anyone with the link can join — perfect for relatives who aren&apos;t
            on Heirloom yet.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-link-role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as LinkRole)}
              disabled={isPending}
            >
              <SelectTrigger id="invite-link-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="kid">Kid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-link-expiry">Expires</Label>
            <Select
              value={expiry}
              onValueChange={setExpiry}
              disabled={isPending}
            >
              <SelectTrigger id="invite-link-expiry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {url ? (
          <div className="space-y-1.5">
            <Label htmlFor="invite-link-url">Invite link</Label>
            <div className="flex gap-2">
              <Input
                id="invite-link-url"
                readOnly
                value={url}
                className="text-xs"
                onFocusCapture={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copy}
                aria-label="Copy invite link"
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>
        ) : null}

        <Button
          type="button"
          className="w-full"
          onClick={generate}
          disabled={isPending}
        >
          {url ? <RefreshCw /> : <Link2 />}
          {isPending
            ? "Generating…"
            : url
              ? "Generate a new link"
              : "Generate invite link"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
