import * as React from "react";
import { getTranslations } from "next-intl/server";

import { getAuthState } from "~/server/auth";
import { SiteHeader } from "~/components/layout/site-header";
import { SiteFooter } from "~/components/layout/site-footer";
import { BottomNav } from "~/components/layout/main-nav";
import { InstallPrompt } from "~/components/pwa/install-prompt";
import { UpdatePrompt } from "~/components/pwa/update-prompt";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("nav");
  const { user } = await getAuthState();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground shadow-token-lg outline-none focus-visible:not-sr-only focus-visible:absolute focus-visible:start-4 focus-visible:top-4 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("skipToContent")}
      </a>
      <SiteHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 pb-24 outline-none md:pb-0"
      >
        {children}
      </main>
      <SiteFooter />
      <BottomNav
        user={user ? { name: user.name, avatarUrl: user.avatarUrl } : null}
      />
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
}
