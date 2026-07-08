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

    // Some mobile browsers drop the wake-lock sentinel when the device rotates
    // between portrait and landscape, and a bfcache restore (navigating back
    // into Cook Mode) resumes the page without re-running mount. Re-acquire in
    // both cases so a propped-up, rotated phone — or a back-navigation — keeps
    // the screen awake. `requestLock()` already no-ops when the document is
    // hidden or a live sentinel is still held, so these can't double-acquire
    // (issue #296). Resize is debounced to coalesce the rotation event storm.
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    function handleReacquire() {
      window.clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => requestLock(), 300);
    }
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) requestLock();
    }

    window.addEventListener("orientationchange", handleReacquire);
    window.addEventListener("resize", handleReacquire);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("orientationchange", handleReacquire);
      window.removeEventListener("resize", handleReacquire);
      window.removeEventListener("pageshow", handlePageShow);
      window.clearTimeout(resizeTimer);
      clearSentinel();
    };
  }, []);

  return status;
}
