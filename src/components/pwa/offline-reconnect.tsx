"use client";

import * as React from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

/** Delay before the auto-reload, giving a restored connection a beat to settle. */
export const RECONNECT_DELAY_MS = 600;

/**
 * If we're online, flip the UI into its "retrying" state and schedule a reload
 * after `delayMs`, returning the timer id so the caller can cancel it. Returns
 * `undefined` (scheduling nothing) when offline. Side-effects are injected so
 * this is unit-testable without a DOM.
 *
 * Centralizing this fixes the bug where a page that mounted already-online would
 * show "Back online — reloading…" forever: the reload used to be scheduled only
 * from the `online` event, which never fires when we're online from the start.
 */
export function scheduleReconnect(
  online: boolean,
  handlers: {
    onRetrying: () => void;
    reload: () => void;
    setTimer?: (callback: () => void, ms: number) => number;
  },
  delayMs: number = RECONNECT_DELAY_MS,
): number | undefined {
  if (!online) return undefined;
  handlers.onRetrying();
  const setTimer = handlers.setTimer ?? ((cb, ms) => window.setTimeout(cb, ms));
  return setTimer(handlers.reload, delayMs);
}

/**
 * Connectivity-aware controls for the offline fallback page. Watches the
 * browser's online/offline events, auto-reloads the moment the network is
 * back, and offers a manual retry. Rendered on `/~offline`, which the service
 * worker serves when a navigation fails with no cached copy.
 */
export function OfflineReconnect() {
  const [online, setOnline] = React.useState(true);
  const [retrying, setRetrying] = React.useState(false);

  React.useEffect(() => {
    // Sync with the real state on mount (SSR always renders "online").
    const isOnline = navigator.onLine;
    setOnline(isOnline);

    let reloadTimer: number | undefined;
    const reconnect = (isNowOnline: boolean) => {
      if (reloadTimer !== undefined) return;
      reloadTimer = scheduleReconnect(isNowOnline, {
        onRetrying: () => setRetrying(true),
        reload: () => window.location.reload(),
      });
    };

    // Already online at mount? The `online` event will never fire, so kick off
    // the reload now — otherwise the badge promises a reload that never comes.
    reconnect(isOnline);

    const handleOnline = () => {
      setOnline(true);
      reconnect(true);
    };
    const handleOffline = () => {
      setOnline(false);
      // Dropped again before the reload fired — cancel it and drop the promise.
      if (reloadTimer !== undefined) {
        window.clearTimeout(reloadTimer);
        reloadTimer = undefined;
        setRetrying(false);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
    };
  }, []);

  const retry = React.useCallback(() => {
    setRetrying(true);
    window.location.reload();
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
          online
            ? "border-success/30 bg-success/10 text-success"
            : "border-border bg-muted text-muted-foreground",
        )}
      >
        {online ? (
          <>
            <Wifi className="size-4" />
            Back online — reloading…
          </>
        ) : (
          <>
            <WifiOff className="size-4" />
            No connection
          </>
        )}
      </span>

      <Button size="lg" onClick={retry} disabled={retrying}>
        <RefreshCw className={cn("size-4", retrying && "animate-spin")} />
        {retrying ? "Reconnecting…" : "Try again"}
      </Button>
    </div>
  );
}
