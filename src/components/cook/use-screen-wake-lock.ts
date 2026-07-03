"use client";

import * as React from "react";

type WakeLockStatus = "checking" | "active" | "released" | "unsupported" | "unavailable";

type ScreenWakeLockSentinel = {
  readonly released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: EventListener) => void;
  removeEventListener: (type: "release", listener: EventListener) => void;
};

type WakeLockCapableNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
  };
};

export function useScreenWakeLock() {
  const [status, setStatus] = React.useState<WakeLockStatus>("checking");
  const sentinelRef = React.useRef<ScreenWakeLockSentinel | null>(null);
  const releaseListenerRef = React.useRef<EventListener | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    function clearSentinel() {
      const sentinel = sentinelRef.current;
      const releaseListener = releaseListenerRef.current;
      sentinelRef.current = null;
      releaseListenerRef.current = null;

      if (!sentinel) return;
      if (releaseListener) {
        sentinel.removeEventListener("release", releaseListener);
      }
      if (!sentinel.released) {
        void sentinel.release().catch(() => undefined);
      }
    }

    function requestLock() {
      if (typeof navigator === "undefined" || typeof document === "undefined") {
        setStatus("unsupported");
        return;
      }

      if (document.visibilityState !== "visible") return;
      if (sentinelRef.current && !sentinelRef.current.released) return;

      const wakeLock = (navigator as WakeLockCapableNavigator).wakeLock;
      if (!wakeLock?.request) {
        setStatus("unsupported");
        return;
      }

      void wakeLock
        .request("screen")
        .then((sentinel) => {
          if (cancelled) {
            if (!sentinel.released) {
              void sentinel.release().catch(() => undefined);
            }
            return;
          }

          const handleRelease: EventListener = () => {
            sentinel.removeEventListener("release", handleRelease);
            if (sentinelRef.current === sentinel) {
              sentinelRef.current = null;
              releaseListenerRef.current = null;
              setStatus("released");
            }
          };

          sentinel.addEventListener("release", handleRelease);
          clearSentinel();
          sentinelRef.current = sentinel;
          releaseListenerRef.current = handleRelease;
          setStatus("active");
        })
        .catch(() => {
          if (!cancelled) setStatus("unavailable");
        });
    }

    requestLock();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") requestLock();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearSentinel();
    };
  }, []);

  return status;
}
