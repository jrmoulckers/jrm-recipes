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

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Tabbable elements inside the dialog, in DOM order, for the focus trap. */
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => el.tabIndex !== -1 && !el.hasAttribute("disabled"));
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
 * Accessibility: it announces `role="dialog"` (`aria-modal="true"`) and honours
 * that contract. On open it captures the previously focused element and moves
 * focus to the primary action; `Tab`/`Shift+Tab` are trapped inside; `Escape`
 * dismisses from anywhere; and focus is restored to the prior element on close
 * (WCAG 2.1.1 Keyboard, 2.1.2 No Keyboard Trap, 2.4.3 Focus Order, 4.1.2).
 */
export function InstallPrompt() {
  const promptRef = React.useRef<BeforeInstallPromptEvent | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [variant, setVariant] = React.useState<"prompt" | "ios" | null>(null);
  const [entered, setEntered] = React.useState(false);

  const labelId = React.useId();
  const descriptionId = React.useId();

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

  // Full dialog focus management, active only while open. On open we remember
  // the previously focused element and move focus to the primary action; Tab is
  // trapped within the dialog; Escape (bound at the document, so it works from
  // anywhere — not just after tabbing in) dismisses; and on close we restore
  // focus to where it was. The listener is added on open and removed on close,
  // so there's no leak, no double-registration, and Escape isn't swallowed when
  // the prompt is closed.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!variant || !container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Move focus to the primary action (Install, or Dismiss on iOS).
    (getFocusable(container)[0] ?? container).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable(container);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        container.focus();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to whatever the user was on before the dialog opened.
      previouslyFocused?.focus?.();
    };
  }, [variant, dismiss]);

  if (!variant) return null;

  const isIos = variant === "ios";

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      className={cn(
        "no-print fixed inset-x-4 z-40 mx-auto max-w-sm focus:outline-none",
        "bottom-[calc(theme(spacing.safe-b)+5rem)] md:bottom-6",
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
        <span className="bg-primary/12 inline-flex size-11 shrink-0 items-center justify-center rounded-xl">
          <LogoMark className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p id={labelId} className="text-sm font-semibold leading-tight">
            Install {brand.name}
          </p>
          {isIos ? (
            <p
              id={descriptionId}
              className="text-xs leading-snug text-muted-foreground"
            >
              Tap{" "}
              <Share
                className="inline-block size-3.5 -translate-y-px"
                aria-hidden
              />
              <span className="sr-only">Share</span> then &ldquo;Add to Home
              Screen&rdquo;.
            </p>
          ) : (
            <p
              id={descriptionId}
              className="truncate text-xs text-muted-foreground"
            >
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
