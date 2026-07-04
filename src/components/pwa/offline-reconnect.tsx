"use client";

import * as React from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

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
    setOnline(navigator.onLine);

    const handleOnline = () => {
      setOnline(true);
      // Give the connection a beat to settle, then return to where they were.
      setRetrying(true);
      window.setTimeout(() => window.location.reload(), 600);
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
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
