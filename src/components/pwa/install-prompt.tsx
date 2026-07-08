"use client";

import * as React from "react";
import { Download, Share, X } from "lucide-react";

import { cn } from "~/lib/utils";
import { brand } from "~/config/brand";
import { Button } from "~/components/ui/button";
import { LogoMark } from "~/components/layout/logo";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt: () => Promise<void>;
}

const DISMISS_KEY = "heirloom:pwa-install-dismissed";
// Don't nag: once dismissed, stay quiet for two weeks.
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function recentlyDismissed() {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * Whether to surface the iOS "Add to Home Screen" tip. iOS Safari never fires
 * `beforeinstallprompt`, so it's the one platform where we must nudge manually.
 * Pure and UA-driven so it's unit-testable. We target only real iOS Safari — not
 * Chrome/Firefox iOS (CriOS/FxiOS), which lack the Share → Add flow — and never
 * when already installed / running standalone.
 */
export function shouldShowIosInstallTip(
  userAgent: string,
  isStandaloneMode: boolean,
): boolean {
  if (isStandaloneMode) return false;
  const ua = userAgent.toLowerCase();
  const isIos = /iphone|ipod|ipad/.test(ua);
  if (!isIos) return false;
  // Third-party iOS browsers can't offer Add-to-Home-Screen; only Safari can.
  const isSafari =
    ua.includes("safari") && !/(crios|fxios|edgios|opios|mercury)/.test(ua);
  return isSafari;
}

/**
 * Add-to-home-screen banner. Waits for the browser's `beforeinstallprompt`,
 * then offers a friendly install nudge. Dismissible (remembered for two weeks),
 * hidden once installed or running standalone. Mounted in the main app chrome
 * only — never in immersive cook/print views.
 *
 * Accessibility: this is a non-modal notification, not a dialog. It's a labelled
 * `role="region"` that announces politely (`aria-live`) when it appears, so it
 * never steals focus. `Escape` dismisses it while focus is inside, and it never
 * traps keyboard focus (WCAG 2.1.1/2.1.2, 4.1.2, 4.1.3).
 */
export function InstallPrompt() {
  const promptRef = React.useRef<BeforeInstallPromptEvent | null>(null);
  const [variant, setVariant] = React.useState<"prompt" | "ios" | null>(null);
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    // iOS Safari never fires `beforeinstallprompt`, so nudge with a manual tip.
    if (shouldShowIosInstallTip(navigator.userAgent, isStandalone())) {
      setVariant("ios");
      return;
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
      setVariant("prompt");
    };
    const onInstalled = () => {
      setVariant(null);
      promptRef.current = null;
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  React.useEffect(() => {
    if (!variant) return;
    // Next frame so the enter transition actually animates.
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [variant]);

  const dismiss = React.useCallback(() => {
    setEntered(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage unavailable (private mode) — fine, just hide for this session.
    }
    window.setTimeout(() => setVariant(null), 200);
  }, []);

  const install = React.useCallback(async () => {
    const deferred = promptRef.current;
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    promptRef.current = null;
    setEntered(false);
    window.setTimeout(() => setVariant(null), 200);
  }, []);

  // Escape dismisses when focus is within the prompt — the expected keyboard
  // affordance — without trapping focus (it's a non-modal notification, not a
  // modal dialog), so nothing is stolen from the rest of the page.
  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
      }
    },
    [dismiss],
  );

  if (!variant) return null;

  const isIos = variant === "ios";

  return (
    <div
      role="region"
      aria-label={`Install ${brand.name}`}
      aria-live="polite"
      aria-atomic="true"
      onKeyDown={onKeyDown}
      className={cn(
        "no-print fixed inset-x-4 z-40 mx-auto max-w-sm",
        "bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-6",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 pr-2 shadow-lg backdrop-blur",
          "transition-all duration-300 ease-out motion-reduce:transition-none",
          entered
            ? "translate-y-0 opacity-100"
            : "translate-y-3 opacity-0 motion-reduce:translate-y-0",
        )}
      >
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12">
          <LogoMark className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            Install {brand.name}
          </p>
          {isIos ? (
            <p className="text-xs leading-snug text-muted-foreground">
              Tap{" "}
              <Share className="inline-block size-3.5 -translate-y-px" aria-hidden />
              <span className="sr-only">Share</span> then &ldquo;Add to Home
              Screen&rdquo;.
            </p>
          ) : (
            <p className="truncate text-xs text-muted-foreground">
              Add to your home screen for one-tap cook mode.
            </p>
          )}
        </div>
        {!isIos && (
          <Button size="sm" onClick={install} className="shrink-0">
            <Download className="size-4" />
            Install
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="size-9 shrink-0"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
