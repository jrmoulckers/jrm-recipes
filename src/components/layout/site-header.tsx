import * as React from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getAuthState } from "~/server/auth";
import { Button } from "~/components/ui/button";
import { Logo } from "~/components/layout/logo";
import { MainNav } from "~/components/layout/main-nav";
import { CommandMenu } from "~/components/layout/command-menu";
import { ThemeSwitcher } from "~/components/theme/theme-switcher";
import { KidsModeToggle } from "~/components/theme/kids-mode-toggle";
import { LocaleSwitcher } from "~/components/i18n/locale-switcher";
import { AccessibilityMenu } from "~/components/a11y/accessibility-menu";
import { OfflineStorageMenu } from "~/components/pwa/offline-storage-menu";
import { AuthControls } from "~/components/auth/auth-controls";
import { NotificationBellServer } from "~/components/notifications/notification-bell-server";

/** Sticky top header with brand, primary nav, theme switcher, and auth. */
export async function SiteHeader() {
  const { isConfigured, user } = await getAuthState();
  const t = await getTranslations("nav");

  return (
    <header className="no-print sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70 [@media(display-mode:standalone)]:pt-safe-t">
      <div className="container flex min-h-16 items-center gap-2 sm:gap-4">
        <Link href="/" className="shrink-0" aria-label={t("homeLink")}>
          {/* Drop the wordmark on the very narrowest phones (<360px) so the
              action row stays a single clean line; the mark keeps brand
              presence (issue #536 follow-up). */}
          <Logo wordmarkClassName="hidden min-[360px]:inline" />
        </Link>

        <div className="mx-2 hidden md:block">
          <MainNav />
        </div>

        <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <CommandMenu />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/recipes/new">{t("newRecipe")}</Link>
          </Button>
          {/* Secondary utility controls stay inline on desktop (lg+). On
              phones/tablets they now live in the Profile hub (reached via the
              bottom bar's Profile tab), so the header stays a clean single row
              without a duplicate "More" menu. */}
          <div className="hidden items-center gap-2 lg:flex">
            <ThemeSwitcher />
            <KidsModeToggle />
            <LocaleSwitcher />
            <AccessibilityMenu />
            <OfflineStorageMenu />
          </div>
          <NotificationBellServer />
          {/* Account avatar / sign-in stays visible on every breakpoint as a
              lightweight account entry point; on mobile it complements the
              bottom bar's Profile tab. */}
          <AuthControls
            isConfigured={isConfigured}
            user={user ? { name: user.name, avatarUrl: user.avatarUrl } : null}
          />
        </div>
      </div>
    </header>
  );
}
