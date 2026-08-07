"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useReducedMotion } from "~/lib/use-reduced-motion";
import { useReadAloud } from "~/lib/use-read-aloud";

/**
 * "Read this to me" control (issue #387).
 *
 * Reads a recipe's steps aloud one at a time using the device's speech
 * synthesis, with big play / pause / stop / re-read / skip controls. The step
 * being read is outlined by toggling a `data-reading-step` attribute on the
 * matching server-rendered list item (`#${anchorPrefix}${i}`), so the steps stay
 * server-rendered and this stays a purely additive enhancement. On browsers
 * without SpeechSynthesis the control shows a plain, non-alarming message.
 */
export function ReadAloudButton({
  steps,
  anchorPrefix,
  className,
}: {
  steps: string[];
  /** DOM id prefix of each step element, e.g. "recipe-step-" for #recipe-step-0. */
  anchorPrefix: string;
  className?: string;
}) {
  const t = useTranslations("recipe");
  const reduced = useReducedMotion();
  const {
    supported,
    status,
    index,
    play,
    pause,
    stop,
    replay,
    next,
    previous,
  } = useReadAloud(steps);

  // Outline the step currently being read and bring it into view.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document
      .querySelectorAll("[data-reading-step]")
      .forEach((el) => el.removeAttribute("data-reading-step"));
    if (index < 0) return;
    const el = document.getElementById(`${anchorPrefix}${index}`);
    if (!el) return;
    el.setAttribute("data-reading-step", "");
    el.scrollIntoView({
      block: "center",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [index, anchorPrefix, reduced]);

  // Clear any lingering highlight if this control unmounts mid-read.
  React.useEffect(() => {
    return () => {
      if (typeof document === "undefined") return;
      document
        .querySelectorAll("[data-reading-step]")
        .forEach((el) => el.removeAttribute("data-reading-step"));
    };
  }, []);

  if (steps.length === 0) return null;

  if (!supported) {
    return (
      <div
        className={cn(
          "text-sm text-muted-foreground",
          "inline-flex items-center gap-2",
          className,
        )}
      >
        <Volume2 className="size-4 shrink-0" aria-hidden="true" />
        <span>{t("readAloud.unavailable")}</span>
      </div>
    );
  }

  const active = status !== "idle";

  return (
    <div
      role="group"
      aria-label={t("readAloud.groupAria")}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {status === "playing" ? (
        <Button type="button" onClick={pause}>
          <Pause aria-hidden="true" /> {t("readAloud.pause")}
        </Button>
      ) : (
        <Button
          type="button"
          variant={active ? "default" : "outline"}
          onClick={play}
        >
          <Play aria-hidden="true" />
          {status === "paused" ? t("readAloud.resume") : t("readAloud.start")}
        </Button>
      )}

      {active && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={previous}
            disabled={index <= 0}
            aria-label={t("readAloud.previousStep")}
          >
            <SkipBack aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={replay}
            aria-label={t("readAloud.reReadStep")}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={next}
            disabled={index >= steps.length - 1}
            aria-label={t("readAloud.nextStep")}
          >
            <SkipForward aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={stop}
            aria-label={t("readAloud.stopReading")}
          >
            <Square aria-hidden="true" />
          </Button>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t("readAloud.progress", {
              current: index + 1,
              total: steps.length,
            })}
          </span>
        </>
      )}
    </div>
  );
}
