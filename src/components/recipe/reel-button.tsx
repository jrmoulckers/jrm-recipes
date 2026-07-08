"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Clapperboard, Loader2 } from "lucide-react";

import { type ReelRecipe } from "~/lib/reel/scenes";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

/**
 * Shown inside the dialog while the reel-studio chunk downloads. It keeps a
 * DialogTitle mounted (Radix requires one for accessibility) so there's no
 * a11y warning during the brief load.
 */
function ReelStudioLoading() {
  return (
    <>
      <DialogHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Clapperboard className="size-5" aria-hidden="true" />
        </div>
        <DialogTitle>Share as a Reel</DialogTitle>
        <DialogDescription>Loading the reel studio…</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <span className="text-sm">Just a moment…</span>
      </div>
    </>
  );
}

// The reel studio (canvas preview + MediaRecorder export + scene builders) is a
// heavy, interaction-only dependency. Load it as a client-only async chunk so it
// stays out of the recipe-detail first-load JS and is fetched only when a viewer
// actually opens the dialog (#200).
const ReelStudio = dynamic(
  () => import("./reel-studio").then((mod) => mod.ReelStudio),
  { ssr: false, loading: () => <ReelStudioLoading /> },
);

export function CreateReelButton({ reel }: { reel: ReelRecipe }) {
  const [open, setOpen] = React.useState(false);
  // The studio mirrors its "rendering a video" busy state here so we can refuse
  // to close mid-render without importing any of the studio chunk ourselves.
  const busyRef = React.useRef(false);

  const onOpenChange = React.useCallback((next: boolean) => {
    if (!next && busyRef.current) return; // don't close mid-render
    setOpen(next);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Clapperboard /> Reel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <ReelStudio reel={reel} busyRef={busyRef} />
      </DialogContent>
    </Dialog>
  );
}
