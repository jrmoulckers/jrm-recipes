"use client";

import * as React from "react";
import { AlertTriangle, Clapperboard, Download, Loader2, Share } from "lucide-react";
import { toast } from "sonner";

import { slugify } from "~/lib/utils";
import { buildReelScenes, type ReelRecipe } from "~/lib/reel/scenes";
import {
  canRecordReel,
  drawPoster,
  playPreview,
  preloadReelImages,
  recordReel,
  type LoadedImages,
  type PreviewHandle,
} from "~/components/recipe/reel/renderer";
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

type LoadState = "idle" | "loading" | "ready" | "error";

/** Detect the user's reduced-motion preference (SSR-safe). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function CreateReelButton({ reel }: { reel: ReelRecipe }) {
  const reducedMotion = usePrefersReducedMotion();
  const scenes = React.useMemo(() => buildReelScenes(reel), [reel]);

  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<LoadState>("idle");
  const [busy, setBusy] = React.useState<null | "download" | "share">(null);
  const [progress, setProgress] = React.useState(0);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const imagesRef = React.useRef<LoadedImages | null>(null);
  const previewRef = React.useRef<PreviewHandle | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const recordingSupported = React.useMemo(() => canRecordReel(), []);
  const nativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const fileName = `heirloom-reel-${slugify(reel.title || "recipe")}.webm`;

  const stopPreview = React.useCallback(() => {
    previewRef.current?.stop();
    previewRef.current = null;
  }, []);

  // Load images + start the preview whenever the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState("loading");
    void (async () => {
      try {
        const images = await preloadReelImages(scenes);
        if (cancelled) return;
        imagesRef.current = images;
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      stopPreview();
    };
  }, [open, scenes, stopPreview]);

  // Paint the poster (reduced motion) or run the looping preview once ready.
  React.useEffect(() => {
    if (!open || state !== "ready") return;
    const canvas = canvasRef.current;
    const images = imagesRef.current;
    if (!canvas || !images) return;

    stopPreview();
    if (reducedMotion || busy) {
      const ctx = canvas.getContext("2d");
      if (ctx) drawPoster(ctx, scenes, images);
      return;
    }
    previewRef.current = playPreview(canvas, scenes, images);
    return stopPreview;
  }, [open, state, reducedMotion, busy, scenes, stopPreview]);

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopPreview();
    };
  }, [stopPreview]);

  function onOpenChange(next: boolean) {
    if (!next && busy) return; // don't close mid-render
    if (!next) {
      abortRef.current?.abort();
      abortRef.current = null;
      stopPreview();
      setState("idle");
      setProgress(0);
    }
    setOpen(next);
  }

  async function render(): Promise<Blob | null> {
    const images = imagesRef.current;
    if (!images) return null;
    stopPreview();
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { blob } = await recordReel(scenes, images, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      return blob;
    } finally {
      abortRef.current = null;
    }
  }

  async function onDownload() {
    if (busy) return;
    setBusy("download");
    try {
      const blob = await render();
      if (!blob) throw new Error("no-blob");
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success("Reel downloaded");
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        toast.error("Couldn't create the reel video");
      }
    } finally {
      setBusy(null);
      setProgress(0);
    }
  }

  async function onShare() {
    if (busy) return;
    setBusy("share");
    try {
      const blob = await render();
      if (!blob) throw new Error("no-blob");
      const file = new File([blob], fileName, { type: blob.type });
      const canShareFile =
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      if (nativeShare && canShareFile) {
        await navigator.share({
          files: [file],
          title: reel.title,
          text: `${reel.title} — a recipe on Heirloom`,
        });
      } else {
        // Fall back to a download when file-sharing isn't available.
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
        toast.success("Reel saved — share it from your gallery");
      }
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        toast.error("Couldn't share the reel video");
      }
    } finally {
      setBusy(null);
      setProgress(0);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Clapperboard /> Reel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clapperboard className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>Share as a Reel</DialogTitle>
          <DialogDescription>
            A 9:16 video of {reel.title}, ready for Reels, TikTok or Stories.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          <div className="relative aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-xl border border-border bg-muted">
            {state === "loading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" aria-hidden="true" />
                <span className="text-sm">Preparing preview…</span>
              </div>
            )}
            {state === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
                <AlertTriangle className="size-6" aria-hidden="true" />
                <span className="text-sm">Couldn&apos;t build the preview.</span>
              </div>
            )}
            <canvas
              ref={canvasRef}
              width={1080}
              height={1920}
              className="size-full"
              aria-label={`Reel preview for ${reel.title}`}
            />
            {busy && (
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-foreground/70 p-3">
                <span className="text-center text-xs font-medium text-background">
                  Rendering video… {Math.round(progress * 100)}%
                </span>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/30">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {reducedMotion && state === "ready" && (
            <p className="text-center text-xs text-muted-foreground">
              Showing a still preview to respect your reduced-motion setting. The
              exported video still animates.
            </p>
          )}
          {!recordingSupported && state === "ready" && (
            <p className="text-center text-xs text-muted-foreground">
              This browser can&apos;t export video. Try Chrome, Edge or Firefox on
              desktop.
            </p>
          )}
        </div>

        <DialogFooter className="sm:justify-center">
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={Boolean(busy)}>
              Close
            </Button>
          </DialogClose>
          {nativeShare && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void onShare()}
              disabled={Boolean(busy) || state !== "ready" || !recordingSupported}
            >
              {busy === "share" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Share />
              )}
              Share
            </Button>
          )}
          <Button
            type="button"
            onClick={() => void onDownload()}
            disabled={Boolean(busy) || state !== "ready" || !recordingSupported}
          >
            {busy === "download" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Download />
            )}
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
