"use client";

import * as React from "react";
import { Download, Link2, Share, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { track } from "~/lib/analytics";
import { shareText, shareMessageWithUrl } from "~/lib/share-text";
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
  shareUrl,
}: {
  title: string;
  author?: string | null;
  // Absolute URL to hand out when sharing. For unlisted recipes this is the
  // unguessable `/r/<token>` link (issue #204); when omitted we fall back to the
  // current page URL (public/group recipes, where the address is shareable).
  shareUrl?: string;
}) {
  // Pre-fetched card image, kept ready so the native share call fires inside
  // the click gesture (Safari drops file sharing if you await first).
  const fileRef = React.useRef<File | null>(null);
  const [canShareFiles, setCanShareFiles] = React.useState(false);

  const nativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const text = shareText({ title, author });

  /** The link to share/copy: the explicit share URL, else this page's URL. */
  function linkToShare(): string {
    return shareUrl ?? window.location.href;
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

  async function downloadCard() {
    const file = await loadCardFile();
    if (!file) {
      toast.error("Couldn't prepare the share card");
      return;
    }
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
    track("share_card_downloaded", {});
    toast.success("Share card downloaded");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        shareMessageWithUrl({ title, author }, linkToShare()),
      );
      track("recipe_shared", { method: "copy_link" });
      track("share_link_copied", {});
      toast.success("Recipe link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          <Share2 /> Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {nativeShare ? (
          <DropdownMenuItem onSelect={() => void shareCard()}>
            <Share />
            {canShareFiles ? "Share card…" : "Share…"}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => void downloadCard()}>
          <Download />
          Download card
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void copyLink()}>
          <Link2 />
          Copy link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
