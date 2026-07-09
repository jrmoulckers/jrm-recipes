"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Database, HardDrive, Trash2 } from "lucide-react";

import { cn } from "~/lib/utils";
import { brand } from "~/config/brand";
import {
  APP_RUNTIME_CACHE_NAMES,
  clearAppCaches,
  estimateOfflineStorage,
  formatBytes,
  requestPersistentStorage,
  type StorageEstimateResult,
} from "~/lib/offline-storage";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

function storageManager(): StorageManager | undefined {
  if (typeof navigator === "undefined") return undefined;
  return navigator.storage;
}

function cacheStorage(): CacheStorage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.caches;
}

/**
 * "Offline storage" control (#172). Surfaced as an icon button in the header
 * since there's no global settings page yet. Shows how much the app has cached
 * (`navigator.storage.estimate()`), lets the user clear the recipe-page and
 * image runtime caches to reclaim space, and best-effort requests durable
 * storage so those caches survive eviction pressure (notably on iOS).
 *
 * The app-shell precache is intentionally left untouched by "clear", so the app
 * still loads offline afterward — cleared recipes simply rebuild as the user
 * browses again.
 */
export function OfflineStorageMenu() {
  const t = useTranslations("pwa.storage");
  const [open, setOpen] = React.useState(false);
  const [estimate, setEstimate] = React.useState<StorageEstimateResult | null>(
    null,
  );
  const [clearing, setClearing] = React.useState(false);
  const [cleared, setCleared] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setEstimate(await estimateOfflineStorage(storageManager()));
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setCleared(false);
    void refresh();
    // Best-effort: ask for durable storage while the user is thinking about it.
    void requestPersistentStorage(storageManager());
  }, [open, refresh]);

  const clear = React.useCallback(async () => {
    setClearing(true);
    try {
      await clearAppCaches(cacheStorage(), APP_RUNTIME_CACHE_NAMES);
      setCleared(true);
      await refresh();
    } finally {
      setClearing(false);
    }
  }, [refresh]);

  const supported = estimate?.supported ?? false;
  const percent = estimate ? Math.round(estimate.ratio * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t("trigger")}>
          <HardDrive className="size-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="size-5 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description", { brand: brand.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
            {supported && estimate ? (
              <>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{t("used")}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatBytes(estimate.usage)}
                    {estimate.quota > 0 && (
                      <>
                        {" / "}
                        {formatBytes(estimate.quota)}
                      </>
                    )}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  aria-label={t("usedLabel")}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${Math.max(2, percent)}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("unavailable")}
              </p>
            )}
          </section>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={clear}
              disabled={clearing}
              className="justify-center"
            >
              <Trash2 className={cn("size-4", clearing && "animate-pulse")} />
              {clearing ? t("clearing") : t("clear")}
            </Button>
            {cleared && (
              <p
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 text-sm text-success"
              >
                <Check className="size-4" />
                {t("cleared")}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
