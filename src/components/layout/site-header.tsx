import * as React from "react";
import Link from "next/link";

import { getAuthState } from "~/server/auth";
import { Button } from "~/components/ui/button";
import { Logo } from "~/components/layout/logo";
import { MainNav } from "~/components/layout/main-nav";
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

  return (
    <header className="no-print sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur [@media(display-mode:standalone)]:pt-safe-t supports-[backdrop-filter]:bg-card/70">
      <div className="container flex min-h-16 items-center gap-4">
        <Link href="/" className="shrink-0" aria-label="Heirloom home">
          <Logo />
        </Link>

        <div className="mx-2 hidden md:block">
          <MainNav />
        </div>

        <div className="ms-auto flex items-center gap-2">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/recipes/new">New recipe</Link>
          </Button>
          <ThemeSwitcher />
          <KidsModeToggle />
          <LocaleSwitcher />
          <AccessibilityMenu />
          <OfflineStorageMenu />
          <NotificationBellServer />
          <AuthControls
            isConfigured={isConfigured}
            user={
              user ? { name: user.name, avatarUrl: user.avatarUrl } : null
            }
          />
        </div>
      </div>
    </header>
  );
}
