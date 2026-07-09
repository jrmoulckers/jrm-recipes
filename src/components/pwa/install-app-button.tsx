"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Download, Share } from "lucide-react";

import { brand } from "~/config/brand";
import { installEntryMode } from "~/lib/install-entry";
import { shouldShowIosInstallTip } from "~/components/pwa/install-prompt";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt: () => Promise<void>;
}

const TRIGGER_CLASS =
  "inline-flex items-center gap-1.5 hover:text-foreground focus-visible:text-foreground";

function computeStandalone(): boolean {
  return (
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * Durable manual "Install app" entry point (#188), mounted in the footer so a
 * user who dismissed the auto-banner still has an in-app path to install. It
 * captures the browser's `beforeinstallprompt` independently of the auto-banner
 * (both receive the same event), so replaying it here never disturbs the
 * banner's two-week dismissal logic. On iOS Safari — which has no programmatic
 * prompt — it opens the same "Add to Home Screen" tip. Hidden once the app is
 * installed / running standalone.
 */
export function InstallAppButton() {
  const t = useTranslations("pwa.installButton");
  const [deferredPrompt, setDeferredPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = React.useState(false);
  const [standalone, setStandalone] = React.useState(false);
  const [iosEligible, setIosEligible] = React.useState(false);

  React.useEffect(() => {
    const sync = () => {
      const sa = computeStandalone();
      setStandalone(sa);
      setIosEligible(shouldShowIosInstallTip(navigator.userAgent, sa));
    };
    sync();

    const onPrompt = (event: Event) => {
      // Keep the event so we can replay it on demand; the browser only fires it
      // once. `preventDefault` here is harmless to the auto-banner (idempotent).
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    const mql =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(display-mode: standalone)")
        : null;
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    mql?.addEventListener("change", sync);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      mql?.removeEventListener("change", sync);
    };
  }, []);

  const mode = installEntryMode({
    standalone,
    installed,
    hasDeferredPrompt: deferredPrompt != null,
    iosEligible,
  });

  const install = React.useCallback(async () => {
    const deferred = deferredPrompt;
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  if (mode === "hidden") return null;

  if (mode === "ios") {
    return (
      <Dialog>
        <DialogTrigger className={TRIGGER_CLASS}>
          <Download className="size-4" aria-hidden />
          {t("label")}
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="size-5 text-primary" />
              {t("dialogTitle", { brand: brand.name })}
            </DialogTitle>
            <DialogDescription>
              {t("dialogDescription", { brand: brand.name })}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t.rich("iosSteps", {
              share: () => (
                <>
                  <Share
                    className="inline-block size-4 -translate-y-px"
                    aria-hidden
                  />
                  <span className="sr-only">{t("iosShareLabel")}</span>
                </>
              ),
              b: (chunks) => (
                <span className="font-medium text-foreground">{chunks}</span>
              ),
            })}
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <button type="button" onClick={install} className={TRIGGER_CLASS}>
      <Download className="size-4" aria-hidden />
      {t("label")}
    </button>
  );
}
