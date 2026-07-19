"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { ThemeSwitcher } from "~/components/theme/theme-switcher";
import { KidsModeToggle } from "~/components/theme/kids-mode-toggle";
import { LocaleSwitcher } from "~/components/i18n/locale-switcher";
import { AccessibilityMenu } from "~/components/a11y/accessibility-menu";
import { OfflineStorageMenu } from "~/components/pwa/offline-storage-menu";

/**
 * Device-level utility toggles surfaced in the Profile hub. These are the exact
 * controls that previously lived behind the header's mobile "More" kebab
 * (removed): appearance, Kids mode, language, accessibility, and offline
 * storage. Each control is self-contained, so we host them as a labeled list.
 */
export function ProfilePreferences() {
  const t = useTranslations("profile.preferences");

  const items: { key: string; label: string; control: React.ReactNode }[] = [
    { key: "appearance", label: t("appearance"), control: <ThemeSwitcher /> },
    { key: "kidsMode", label: t("kidsMode"), control: <KidsModeToggle /> },
    { key: "language", label: t("language"), control: <LocaleSwitcher /> },
    {
      key: "accessibility",
      label: t("accessibility"),
      control: <AccessibilityMenu />,
    },
    { key: "offline", label: t("offline"), control: <OfflineStorageMenu /> },
  ];

  return (
    <ul className="grid gap-1">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex items-center gap-3 rounded-lg px-1 py-1.5"
        >
          {item.control}
          <span className="min-w-0 flex-1 text-sm font-medium">
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
