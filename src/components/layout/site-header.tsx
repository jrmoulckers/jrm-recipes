import * as React from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getAuthState } from "~/server/auth";
import { Button } from "~/components/ui/button";
import { Logo } from "~/components/layout/logo";
import { MainNav } from "~/components/layout/main-nav";
import { CommandMenu } from "~/components/layout/command-menu";
import { HeaderSettingsMenu } from "~/components/layout/header-settings-menu";
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

        <div className="mx-2 hidden xl:block">
          <MainNav />
        </div>

        <div className="ms-auto flex min-w-0 flex-nowrap items-center justify-end gap-1.5 sm:gap-2">
          <CommandMenu />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/recipes/new">{t("newRecipe")}</Link>
          </Button>
          {/* All device-level utility controls (appearance, Kids mode, language,
              accessibility, offline storage) collapse into one Settings popover
              on desktop so the top-right stays a single clean row. Below xl the
              full horizontal nav gives way to the app bottom bar, and these
              utilities live in its Profile hub — so the header never grows a
              duplicate row of look-alike icons. */}
          <div className="hidden xl:block">
            <HeaderSettingsMenu />
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
