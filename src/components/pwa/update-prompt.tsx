"use client";

import * as React from "react";
import { RefreshCw, X } from "lucide-react";

import { cn } from "~/lib/utils";
import { brand } from "~/config/brand";
import { Button } from "~/components/ui/button";
import { hasRunningCookTimers } from "~/lib/cook-state";
import { SKIP_WAITING_MESSAGE, shouldShowUpdatePrompt } from "~/lib/sw-update";

/** How often to re-check whether a Cook Mode session is still holding the prompt back. */
const COOK_RECHECK_INTERVAL_MS = 10_000;

/**
 * User-controlled "update available" prompt (issue #163).
 *
 * The service worker ships with `skipWaiting: false`, so a new deploy installs
 * and then sits in `waiting` instead of swapping precached chunks mid-session.
 * This banner watches the registration for that waiting worker and offers a
 * non-blocking "Reload" affordance. Accepting posts `SKIP_WAITING` to the
 * waiting worker; when it takes control (`controllerchange`) we reload exactly
 * once. The prompt is deferred while a Cook Mode session has running timers so
 * it never interrupts hands-free cooking.
 *
 * Non-modal by design (`role="status"`, `aria-live="polite"`): it announces
 * itself without trapping focus, unlike the install prompt. Mounted in the main
 * app chrome only — never in immersive cook/print views.
 */
export function UpdatePrompt() {
  const [waitingWorker, setWaitingWorker] =
    React.useState<ServiceWorker | null>(null);
  const [blockedByCook, setBlockedByCook] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [entered, setEntered] = React.useState(false);
  // Set when the user accepts the prompt, so a first-ever visit that later
  // receives an update in the same session still reloads on activation even
  // though there was no controller when the page first loaded.
  const userAcceptedRef = React.useRef(false);

  // Detect a waiting service worker and reload once it takes control.
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const container = navigator.serviceWorker;
    let cancelled = false;
    let reloading = false;
    // Whether this page was already controlled when it loaded. On a first-ever
    // visit there's no controller yet, so the new worker's `clientsClaim`
    // activation fires `controllerchange` — that's an install, NOT an update, so
    // we must not reload. Only an update that replaces an existing controller
    // (after the user accepts) should trigger the one-time reload.
    const hadControllerAtLoad = container.controller != null;

    const onControllerChange = () => {
      // Guard so a single activation triggers a single reload. Reload only when
      // this page was already controlled at load (a genuine update replacing an
      // existing worker, incl. other tabs) or when the user accepted the prompt
      // here — never on the first-install `clientsClaim` activation.
      if (reloading || (!hadControllerAtLoad && !userAcceptedRef.current)) {
        return;
      }
      reloading = true;
      window.location.reload();
    };
    container.addEventListener("controllerchange", onControllerChange);

    const considerWaiting = (registration: ServiceWorkerRegistration) => {
      if (
        cancelled ||
        !shouldShowUpdatePrompt({
          hasController: container.controller != null,
          hasWaitingWorker: registration.waiting != null,
        })
      ) {
        return;
      }
      setWaitingWorker(registration.waiting);
    };

    const trackInstalling = (
      registration: ServiceWorkerRegistration,
      worker: ServiceWorker | null,
    ) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") considerWaiting(registration);
      });
    };

    container
      .getRegistration()
      .then((registration) => {
        if (!registration || cancelled) return;
        // A worker already finished installing before this page loaded.
        considerWaiting(registration);
        // …or one is installing right now / starts while this tab is open.
        trackInstalling(registration, registration.installing);
        registration.addEventListener("updatefound", () => {
          trackInstalling(registration, registration.installing);
        });
      })
      .catch(() => {
        // No registration or unsupported — simply never prompt.
      });

    return () => {
      cancelled = true;
      container.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  // While a worker waits, keep the prompt out of the way of an active cook
  // session; re-check on a timer and whenever the tab is refocused.
  React.useEffect(() => {
    if (!waitingWorker) return;
    const check = () => {
      try {
        setBlockedByCook(hasRunningCookTimers(window.localStorage, Date.now()));
      } catch {
        // Storage unavailable (private mode) — assume nothing is cooking.
        setBlockedByCook(false);
      }
    };
    check();
    const timer = window.setInterval(check, COOK_RECHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [waitingWorker]);

  const visible = waitingWorker != null && !blockedByCook && !dismissed;

  React.useEffect(() => {
    if (!visible) return;
    // Next frame so the enter transition actually animates.
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [visible]);

  const reload = React.useCallback(() => {
    if (!waitingWorker) return;
    userAcceptedRef.current = true;
    setEntered(false);
    // Serwist activates the waiting worker on this message; the
    // `controllerchange` handler above then reloads the page once.
    waitingWorker.postMessage(SKIP_WAITING_MESSAGE);
  }, [waitingWorker]);

  const dismiss = React.useCallback(() => {
    setEntered(false);
    window.setTimeout(() => setDismissed(true), 200);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "no-print fixed inset-x-4 z-40 mx-auto max-w-sm",
        "bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-6",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 pe-2 shadow-lg backdrop-blur",
          "transition-all duration-300 ease-out motion-reduce:transition-none",
          entered
            ? "translate-y-0 opacity-100"
            : "translate-y-3 opacity-0 motion-reduce:translate-y-0",
        )}
      >
        <span className="bg-primary/12 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-primary">
          <RefreshCw className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            Update available
          </p>
          <p className="truncate text-xs text-muted-foreground">
            A new version of {brand.name} is ready.
          </p>
        </div>
        <Button size="sm" onClick={reload} className="shrink-0">
          <RefreshCw className="size-4" />
          Reload
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={dismiss}
          aria-label="Dismiss update notification"
          className="size-9 shrink-0"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
