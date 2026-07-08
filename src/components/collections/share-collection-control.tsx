"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { setCollectionVisibilityAction } from "~/server/collections/actions";
import { type CollectionVisibilityValue } from "~/server/collections/validation";
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

const VISIBILITY_OPTIONS: {
  value: CollectionVisibilityValue;
  label: string;
  hint: string;
}[] = [
  { value: "private", label: "Private", hint: "Only you can see this cookbook." },
  {
    value: "unlisted",
    label: "Unlisted",
    hint: "Anyone with the link can view it.",
  },
  { value: "public", label: "Public", hint: "Anyone can find and view it." },
];

/**
 * Owner-only sharing control: pick a visibility and, once shared, copy the
 * unguessable link. Optimistically reflects the choice and rolls back on error.
 */
export function ShareCollectionControl({
  collectionId,
  visibility: initialVisibility,
  shareToken: initialShareToken,
}: {
  collectionId: string;
  visibility: CollectionVisibilityValue;
  shareToken: string | null;
}) {
  const router = useRouter();
  const [visibility, setVisibility] = React.useState(initialVisibility);
  const [shareToken, setShareToken] = React.useState(initialShareToken);
  const [copied, setCopied] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/collections/${shareToken}`
      : "";

  function change(next: CollectionVisibilityValue) {
    const previous = visibility;
    setVisibility(next);
    startTransition(() => {
      void setCollectionVisibilityAction(collectionId, next).then((result) => {
        if (!result.ok) {
          setVisibility(previous);
          toast.error(friendlyError(result.error));
          return;
        }
        setShareToken(result.shareToken);
        router.refresh();
      });
    });
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Share link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  const active = VISIBILITY_OPTIONS.find((o) => o.value === visibility);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <Share2 /> Share
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="space-y-1.5">
          <Label>Visibility</Label>
          <Select
            value={visibility}
            onValueChange={(v) => change(v as CollectionVisibilityValue)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISIBILITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {active ? (
            <p className="text-xs text-muted-foreground">{active.hint}</p>
          ) : null}
        </div>

        {visibility !== "private" && shareUrl ? (
          <div className="space-y-1.5">
            <Label htmlFor="collection-share-url">Share link</Label>
            <div className="flex gap-2">
              <Input
                id="collection-share-url"
                readOnly
                value={shareUrl}
                className="text-xs"
                onFocusCapture={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copy}
                aria-label="Copy share link"
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
