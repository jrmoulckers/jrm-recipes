"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { MoreHorizontal } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { ThemeSwitcher } from "~/components/theme/theme-switcher";
import { KidsModeToggle } from "~/components/theme/kids-mode-toggle";
import { LocaleSwitcher } from "~/components/i18n/locale-switcher";
import { AccessibilityMenu } from "~/components/a11y/accessibility-menu";
import { OfflineStorageMenu } from "~/components/pwa/offline-storage-menu";

/**
 * Mobile "More" overflow for the header's secondary utility controls (#536
 * follow-up). On phones the header only has room for the primary actions
 * (search, notifications, avatar); cramming all eight buttons in forced an ugly
 * wrapped second row. This collapses the five secondary toggles — appearance,
 * Kids mode, language, accessibility, and offline storage — behind a single
 * kebab so the header stays a clean single row. It is `lg:hidden`; at lg+ the
 * controls render inline in {@link SiteHeader}.
 *
 * Each control is a self-contained menu/dialog with its own trigger, so they are
 * hosted here as a labeled list rather than nested inside menu items. The
 * popover deliberately stays open while a nested menu/dialog is interacted with
 * (their portalled surfaces would otherwise read as an outside click), and
 * closes on a genuine outside tap or Escape.
 */
export function HeaderOverflowMenu({ className }: { className?: string }) {
  const t = useTranslations("nav.overflow");

  const items: { key: string; control: React.ReactNode }[] = [
    {
      key: "appearance",
      control: <ThemeSwitcher label={t("appearance")} />,
    },
    {
      key: "kidsMode",
      control: <KidsModeToggle label={t("kidsMode")} />,
    },
    {
      key: "language",
      control: <LocaleSwitcher label={t("language")} />,
    },
    {
      key: "accessibility",
      control: <AccessibilityMenu label={t("accessibility")} />,
    },
    {
      key: "offline",
      control: <OfflineStorageMenu label={t("offline")} />,
    },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("trigger")}
          className={className}
        >
          <MoreHorizontal className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-60"
        // Keep the menu open when a hosted control's own popover/dialog (each
        // portalled outside this content) is the interaction target.
        onInteractOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (
            target?.closest(
              "[data-radix-popper-content-wrapper],[role='dialog']",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <p className="px-1 pb-2 text-sm font-semibold text-muted-foreground">
          {t("heading")}
        </p>
        <ul className="grid gap-1">
          {items.map((item) => (
            <li key={item.key}>{item.control}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
