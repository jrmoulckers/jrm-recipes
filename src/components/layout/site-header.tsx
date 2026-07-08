import * as React from "react";
import Link from "next/link";

import { getAuthState } from "~/server/auth";
import { Button } from "~/components/ui/button";
import { Logo } from "~/components/layout/logo";
import { MainNav } from "~/components/layout/main-nav";
import { ThemeSwitcher } from "~/components/theme/theme-switcher";
import { LocaleSwitcher } from "~/components/i18n/locale-switcher";
import { AccessibilityMenu } from "~/components/a11y/accessibility-menu";
import { AuthControls } from "~/components/auth/auth-controls";

/** Sticky top header with brand, primary nav, theme switcher, and auth. */
export async function SiteHeader() {
  const { isConfigured, user } = await getAuthState();

  return (
    <header className="no-print sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
      <div className="container flex h-16 items-center gap-4">
        <Link href="/" className="shrink-0" aria-label="Heirloom home">
          <Logo />
        </Link>

        <div className="mx-2 hidden md:block">
          <MainNav />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/recipes/new">New recipe</Link>
          </Button>
          <ThemeSwitcher />
          <LocaleSwitcher />
          <AccessibilityMenu />
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
