"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Copy,
  ExternalLink,
  Gift,
  Link2,
  Link2Off,
  RefreshCw,
  Share,
  Share2,
} from "lucide-react";
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
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { track } from "~/lib/analytics";
import {
  buildKeepsakePath,
  KEEPSAKE_FROM_MAX,
  KEEPSAKE_NOTE_MAX,
} from "~/lib/keepsake";
import { shareText, shareMessageWithUrl } from "~/lib/share-text";
import { setShareLinkStateAction } from "~/server/recipes/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "recipe"
  );
}

/** URL of this recipe's generated share-card image. */
function cardImageUrl(): string {
  // Next emits the (build-hashed) opengraph-image URL into this meta tag, so
  // read it rather than guessing the path.
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[property="og:image"]',
  );
  if (meta?.content) return meta.content;
  const { origin, pathname } = window.location;
  return `${origin}${pathname.replace(/\/$/, "")}/opengraph-image`;
}

export function ShareButton({
  title,
  author,
  slug,
  shareUrl,
  recipeId,
  manageable = false,
  shareEnabled = true,
  defaultFrom,
  keepsakeToken,
}: {
  title: string;
  author?: string | null;
  // Recipe slug, used to build the personalized "keepsake" link.
  slug: string;
  // Absolute URL to hand out when sharing. For unlisted recipes this is the
  // unguessable `/r/<token>` link (issue #204); when omitted we fall back to the
  // current page URL (public/group recipes, where the address is shareable).
  shareUrl?: string;
  // Owner-only revoke/rotate controls (issue #207) are shown when this recipe is
  // the viewer's own unlisted recipe. `recipeId` targets the server action and
  // `shareEnabled` seeds the current link state.
  recipeId?: string;
  manageable?: boolean;
  shareEnabled?: boolean;
  // Seeds the "from" field of a personalized keepsake link (issue #407).
  defaultFrom?: string | null;
  // Share token threaded into an unlisted recipe's keepsake link so the
  // recipient can open it without an account, exactly like a normal share link.
  keepsakeToken?: string | null;
}) {
  // Pre-fetched card image, kept ready so the native share call fires inside
  // the click gesture (Safari drops file sharing if you await first).
  const fileRef = React.useRef<File | null>(null);
  const [canShareFiles, setCanShareFiles] = React.useState(false);
  // Live share-link state so revoke/rotate updates the copied URL in place.
  const [enabled, setEnabled] = React.useState(shareEnabled);
  const [currentUrl, setCurrentUrl] = React.useState(shareUrl);
  const [pending, setPending] = React.useState(false);
  // Personalize ("hand down") dialog state (issue #407): a name + note carried
  // in the keepsake URL, no server round-trip and nothing to store.
  const [personalizeOpen, setPersonalizeOpen] = React.useState(false);
  const [from, setFrom] = React.useState(defaultFrom ?? "");
  const [note, setNote] = React.useState("");

  const t = useTranslations("share");

  const nativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const text = shareText({ title, author });

  /** The link to share/copy: the live share URL, else this page's URL. */
  function linkToShare(): string {
    return currentUrl ?? window.location.href;
  }

  async function changeShareLink(change: {
    enabled?: boolean;
    rotate?: boolean;
  }) {
    if (!recipeId || pending) return;
    setPending(true);
    try {
      const result = await setShareLinkStateAction(recipeId, change);
      if (!result.ok) {
        toast.error(result.error ?? t("toast.linkUpdateError"));
        return;
      }
      setEnabled(result.enabled);
      setCurrentUrl(result.url ?? undefined);
      if (change.rotate) {
        track("share_link_rotated", {});
        toast.success(t("toast.linkReset"));
      } else if (change.enabled === false) {
        track("share_link_disabled", {});
        toast.success(t("toast.linkDisabled"));
      } else {
        toast.success(t("toast.linkEnabled"));
      }
    } catch {
      toast.error("Couldn't update the share link");
    } finally {
      setPending(false);
    }
  }

  async function loadCardFile(): Promise<File | null> {
    if (fileRef.current) return fileRef.current;
    try {
      const res = await fetch(cardImageUrl());
      if (!res.ok) return null;
      const blob = await res.blob();
      const file = new File([blob], `heirloom-${slugify(title)}.png`, {
        type: blob.type || "image/png",
      });
      fileRef.current = file;
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        setCanShareFiles(true);
      }
      return file;
    } catch {
      return null;
    }
  }

  // Warm the image (and file-share capability check) when the menu opens.
  function onOpenChange(open: boolean) {
    if (open && !fileRef.current) void loadCardFile();
  }

  async function shareCard() {
    const url = linkToShare();
    const file = fileRef.current;
    try {
      if (
        file &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        // Track inside the gesture — never await before navigator.share (Safari).
        track("recipe_shared", { method: "file" });
        await navigator.share({ files: [file], title, text, url });
        return;
      }
      if (nativeShare) {
        track("recipe_shared", { method: "native" });
        await navigator.share({ title, text, url });
        return;
      }
      await copyLink();
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        shareMessageWithUrl({ title, author }, linkToShare()),
      );
      track("recipe_shared", { method: "copy_link" });
      track("share_link_copied", {});
      toast.success(t("toast.linkCopied"));
    } catch {
      toast.error(t("toast.copyError"));
    }
  }

  /** Absolute personalized keepsake URL carrying the current name + note. */
  function keepsakeUrl(): string {
    const path = buildKeepsakePath(slug, { from, note, token: keepsakeToken });
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${path}`;
  }

  async function copyKeepsakeLink() {
    try {
      await navigator.clipboard.writeText(keepsakeUrl());
      track("recipe_shared", { method: "keepsake" });
      toast.success(t("toast.personalizedCopied"));
    } catch {
      toast.error(t("toast.copyError"));
    }
  }

  function previewKeepsake() {
    window.open(keepsakeUrl(), "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline">
            <Share2 /> {t("button")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {nativeShare ? (
            <DropdownMenuItem onSelect={() => void shareCard()}>
              <Share />
              {canShareFiles ? t("menu.shareCard") : t("menu.share")}
            </DropdownMenuItem>
          ) : null}
          {nativeShare ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <Link2 />
            {t("menu.copyLink")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setPersonalizeOpen(true);
            }}
          >
            <Gift />
            {t("menu.personalize")}
          </DropdownMenuItem>
          {manageable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={pending}
                onSelect={(event) => {
                  event.preventDefault();
                  void changeShareLink({ enabled: !enabled });
                }}
              >
                <Link2Off />
                {enabled ? t("menu.disableLink") : t("menu.enableLink")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pending}
                onSelect={(event) => {
                  event.preventDefault();
                  void changeShareLink({ rotate: true });
                }}
              >
                <RefreshCw />
                {t("menu.resetLink")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={personalizeOpen} onOpenChange={setPersonalizeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("personalize.title")}</DialogTitle>
            <DialogDescription>
              {t("personalize.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="keepsake-from">
                {t("personalize.nameLabel")}
              </Label>
              <Input
                id="keepsake-from"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                placeholder={t("personalize.namePlaceholder")}
                maxLength={KEEPSAKE_FROM_MAX}
                autoComplete="name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="keepsake-note">
                {t("personalize.messageLabel")}
              </Label>
              <Textarea
                id="keepsake-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("personalize.messagePlaceholder")}
                rows={4}
                maxLength={KEEPSAKE_NOTE_MAX}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" onClick={() => void copyKeepsakeLink()}>
              <Copy /> {t("personalize.copy")}
            </Button>
            <Button type="button" variant="outline" onClick={previewKeepsake}>
              <ExternalLink /> {t("personalize.preview")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t("personalize.done")}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
