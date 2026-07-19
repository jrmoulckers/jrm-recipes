"use client";

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
 * storage. Each control accepts a `label` prop that renders it as a full-width,
 * left-aligned row (icon + text as one large tap target, #539) rather than the
 * icon-only header button.
 */
export function ProfilePreferences() {
  const t = useTranslations("profile.preferences");

  return (
    <ul className="grid gap-0.5">
      <li>
        <ThemeSwitcher label={t("appearance")} />
      </li>
      <li>
        <KidsModeToggle label={t("kidsMode")} />
      </li>
      <li>
        <LocaleSwitcher label={t("language")} />
      </li>
      <li>
        <AccessibilityMenu label={t("accessibility")} />
      </li>
      <li>
        <OfflineStorageMenu label={t("offline")} />
      </li>
    </ul>
  );
}
