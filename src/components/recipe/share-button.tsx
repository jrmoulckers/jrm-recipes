"use client";

import * as React from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";

export function ShareButton({ title }: { title: string }) {
  async function onShare() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  }

  return (
    <Button type="button" variant="outline" onClick={onShare}>
      <Share2 /> Share
    </Button>
  );
}
