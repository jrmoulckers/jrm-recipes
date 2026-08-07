"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Link2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import {
  createInviteLinkAction,
  revokeInviteLinkAction,
} from "~/server/groups/actions";
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
  { value: "never", labelKey: "never" },
  { value: "7", labelKey: "days7" },
  { value: "30", labelKey: "days30" },
  { value: "90", labelKey: "days90" },
] as const;

/**
 * Manager-only "share an invite link" affordance (issue #343). Generates a
 * tokenized `/join/<token>` URL, role-scoped (member/kid) and optionally
 * expiring, that a non-user can open, sign up, and land straight into the
 * group. This is the acquisition loop `AddMemberForm` can't cover (that form
 * needs the invitee to already have an account).
 */
export function InviteLinkManager({ slug }: { slug: string }) {
  const t = useTranslations("groups.inviteLink");
  const [role, setRole] = React.useState<LinkRole>("member");
  const [expiry, setExpiry] = React.useState<string>("never");
  const [url, setUrl] = React.useState<string | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const [isRevoking, startRevoke] = React.useTransition();

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
          setToken(result.token);
          setCopied(false);
          toast.success(t("toast.ready"));
        },
      );
    });
  }

  function revoke() {
    if (!token) return;
    startRevoke(() => {
      void revokeInviteLinkAction(slug, token).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        setUrl(null);
        setToken(null);
        setCopied(false);
        toast.success(t("toast.revoked"));
      });
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("toast.copied"));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("toast.copyFailed"));
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <Link2 /> {t("trigger")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("title")}</p>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-link-role">{t("role.label")}</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as LinkRole)}
              disabled={isPending}
            >
              <SelectTrigger id="invite-link-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">{t("role.member")}</SelectItem>
                <SelectItem value="kid">{t("role.kid")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-link-expiry">{t("expires")}</Label>
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
                    {t(`expiry.${option.labelKey}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {url ? (
          <div className="space-y-1.5">
            <Label htmlFor="invite-link-url">{t("linkLabel")}</Label>
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
                aria-label={t("a11y.copyInviteLink")}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={revoke}
              disabled={isRevoking}
            >
              <Trash2 />
              {isRevoking ? t("actions.revoking") : t("actions.revoke")}
            </Button>
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
            ? t("actions.generating")
            : url
              ? t("actions.generateNew")
              : t("actions.generate")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
