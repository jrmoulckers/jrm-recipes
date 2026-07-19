"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignOutButton,
  SignUpButton,
} from "@clerk/nextjs";
import {
  Bell,
  ChefHat,
  CreditCard,
  Database,
  LogOut,
  Salad,
  ShieldBan,
  Tag,
} from "lucide-react";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";

import { navByKey, pinnableNav, type NavKey } from "~/config/nav";
import { useBottomNavStore } from "~/lib/bottom-nav-store";
import { track } from "~/lib/analytics";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { BottomNavCustomizer } from "~/components/profile/bottom-nav-customizer";
import { ProfilePreferences } from "~/components/profile/profile-preferences";

export type ProfileUser = {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

type SettingsLink = { href: Route; labelKey: string; icon: LucideIcon };

const SETTINGS_LINKS: SettingsLink[] = [
  { href: "/settings/dietary", labelKey: "dietary", icon: Salad },
  { href: "/settings/notifications", labelKey: "notifications", icon: Bell },
  { href: "/settings/blocked", labelKey: "blocked", icon: ShieldBan },
  { href: "/settings/data", labelKey: "data", icon: Database },
  { href: "/settings/billing", labelKey: "billing", icon: CreditCard },
  { href: "/pricing", labelKey: "pricing", icon: Tag },
];

function initialsOf(name: string | null): string {
  return (
    name
      ?.split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "HC"
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-token">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {description ? (
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * The single account/settings hub reached from the bottom bar's Profile tab. It
 * consolidates what used to be split between the header's "More" kebab (utility
 * toggles) and the bottom bar's "More" menu (secondary destinations), plus
 * account/auth actions — eliminating the confusing duplicate menus.
 */
export function ProfileHub({
  isConfigured,
  user,
}: {
  isConfigured: boolean;
  user: ProfileUser | null;
}) {
  const t = useTranslations("profile");
  const tNav = useTranslations("nav");
  const pathname = usePathname();
  const hydrated = useBottomNavStore((s) => s.hydrated);
  const pinned = useBottomNavStore((s) => s.pinned);

  const isActive = (key: NavKey) => {
    const item = navByKey[key];
    return item.match ? item.match(pathname) : pathname === item.href;
  };

  return (
    <div className="container flex max-w-2xl flex-col gap-6 py-8">
      {/* Identity / auth. */}
      <header className="flex items-center gap-4">
        <Avatar className="size-14">
          {user?.avatarUrl ? (
            <AvatarImage src={user.avatarUrl} alt="" />
          ) : null}
          <AvatarFallback>{initialsOf(user?.name ?? null)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-bold tracking-tight">
            {user?.name ?? t("guest")}
          </h1>
          {user?.email ? (
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("guestBlurb")}</p>
          )}
        </div>
      </header>

      {/* Signed-out call to action (Clerk-configured deployments). */}
      {isConfigured ? (
        <SignedOut>
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 shadow-token sm:flex-row">
            <SignUpButton mode="modal">
              <Button
                className="flex-1"
                onClick={() => track("signup_started", {})}
              >
                {t("startCookbook")}
              </Button>
            </SignUpButton>
            <SignInButton mode="modal">
              <Button variant="outline" className="flex-1">
                {t("signIn")}
              </Button>
            </SignInButton>
          </div>
        </SignedOut>
      ) : null}

      {/* Customizable bottom bar. */}
      <Section title={t("tabs.title")} description={t("tabs.description")}>
        {hydrated ? (
          <ul className="mb-4 flex flex-wrap gap-2" aria-label={t("tabs.current")}>
            {pinned.map((key) => {
              const Icon = navByKey[key].icon;
              return (
                <li
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/50 px-3 py-1 text-sm font-medium"
                >
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {tNav(navByKey[key].labelKey)}
                </li>
              );
            })}
            <li className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {t("title")}
            </li>
          </ul>
        ) : null}
        <BottomNavCustomizer
          trigger={<Button variant="outline">{t("tabs.customize")}</Button>}
        />
      </Section>

      {/* Navigate: every destination stays reachable here. */}
      <Section title={t("navigate.title")}>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {pinnableNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.id);
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted",
                    active && "border-primary/40 bg-primary/10 text-primary",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{tNav(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/recipes/new"
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <ChefHat className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{tNav("create")}</span>
            </Link>
          </li>
        </ul>
      </Section>

      {/* Device preferences (moved from the header's mobile "More" kebab). */}
      <Section title={t("preferences.title")}>
        <ProfilePreferences />
      </Section>

      {/* Account & settings. */}
      <Section title={t("settings.title")}>
        <ul className="grid gap-1">
          {SETTINGS_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="truncate">{t(`settings.${link.labelKey}`)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {isConfigured ? (
          <SignedIn>
            <div className="mt-3 border-t border-border pt-3">
              <SignOutButton>
                <Button variant="ghost" className="w-full justify-start gap-3">
                  <LogOut className="size-4" aria-hidden="true" />
                  {t("signOut")}
                </Button>
              </SignOutButton>
            </div>
          </SignedIn>
        ) : null}
      </Section>
    </div>
  );
}
