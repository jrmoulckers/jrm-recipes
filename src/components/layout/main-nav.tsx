"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleUser } from "lucide-react";

import {
  DEFAULT_MOBILE_PINNED,
  navByKey,
  primaryNav,
  type NavItem,
} from "~/config/nav";
import { useBottomNavStore } from "~/lib/bottom-nav-store";
import { cn } from "~/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";

export type BottomNavUser = {
  name: string | null;
  avatarUrl: string | null;
};

function isActive(pathname: string, item: NavItem) {
  return item.match ? item.match(pathname) : pathname === item.href;
}

function initialsOf(name: string | null): string {
  const initials = name
    ?.split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return initials && initials.length > 0 ? initials : "";
}

/** Horizontal nav for the desktop header. */
export function MainNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  return (
    <nav
      aria-label={t("landmarks.primary")}
      className="hidden items-center gap-1 md:flex"
    >
      {primaryNav.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground",
              active
                ? "font-semibold text-foreground"
                : "text-muted-foreground",
            )}
          >
            {t(item.labelKey)}
            {/* Underline wipes in from the start edge on the active link. */}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-3 bottom-1 h-0.5 origin-left rounded-full bg-foreground transition-transform duration-base ease-standard motion-reduce:transition-none",
                active ? "scale-x-100" : "scale-x-0",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}

/** App-like bottom tab bar for mobile with a customizable set of tabs. */
export function BottomNav({ user }: { user?: BottomNavUser | null }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const hydrated = useBottomNavStore((s) => s.hydrated);
  const storedPinned = useBottomNavStore((s) => s.pinned);

  // Hide chrome in immersive / focused routes (cook mode, print, and the
  // recipe editor — its sticky mobile Save/Cancel bar owns the bottom edge,
  // issue #294).
  if (
    pathname.includes("/cook") ||
    pathname.includes("/print") ||
    pathname.endsWith("/edit") ||
    pathname.endsWith("/new")
  )
    return null;

  // Render the out-of-the-box tabs on the server and first client paint, then
  // swap in the user's saved selection once localStorage has rehydrated. This
  // keeps SSR markup stable (no hydration mismatch / flash).
  const pinnedKeys = hydrated ? storedPinned : DEFAULT_MOBILE_PINNED;
  const tabs = pinnedKeys.map((key) => navByKey[key]).filter(Boolean);

  const profileActive = pathname.startsWith("/profile");
  // The Profile slot is always the fixed last tab.
  const count = tabs.length + 1;
  // First matching tab drives the sliding indicator. Computed from the pathname
  // so it's correct on SSR, initial load, and back/forward — no flash.
  const activeIndex = tabs.findIndex((item) => isActive(pathname, item));
  const indicatorIndex =
    activeIndex >= 0 ? activeIndex : profileActive ? count - 1 : -1;

  return (
    <nav
      aria-label={t("landmarks.primaryMobile")}
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
    >
      <ul className="relative mx-auto flex max-w-md items-stretch justify-around px-2 pb-safe-b">
        {/* A pill that glides along the top edge to the active tab. */}
        {indicatorIndex >= 0 && (
          <li
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 top-0 flex h-0.5"
          >
            <span
              className="flex h-full justify-center transition-transform duration-base ease-standard motion-reduce:transition-none"
              style={{
                width: `${100 / count}%`,
                transform: `translateX(${indicatorIndex * 100}%)`,
              }}
            >
              <span className="h-full w-8 rounded-full bg-primary" />
            </span>
          </li>
        )}
        {tabs.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[0.7rem] font-medium transition-colors active:bg-muted",
                  active
                    ? "font-semibold text-primary"
                    : "text-muted-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-5 transition-transform duration-base ease-standard motion-reduce:transition-none",
                    active && "-translate-y-0.5 scale-110",
                  )}
                />
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
        {/* Fixed Profile / account slot — the single hub for utilities, the
            non-pinned destinations, and account actions. */}
        <li className="flex-1">
          <Link
            href="/profile"
            aria-current={profileActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[0.7rem] font-medium transition-colors active:bg-muted",
              profileActive
                ? "font-semibold text-primary"
                : "text-muted-foreground",
            )}
          >
            {user ? (
              <Avatar
                className={cn(
                  "size-5 transition-transform duration-base ease-standard motion-reduce:transition-none",
                  profileActive && "-translate-y-0.5 scale-110 ring-2 ring-primary",
                )}
              >
                {user.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt="" />
                ) : null}
                <AvatarFallback className="text-[0.6rem]">
                  {initialsOf(user.name)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <CircleUser
                className={cn(
                  "size-5 transition-transform duration-base ease-standard motion-reduce:transition-none",
                  profileActive && "-translate-y-0.5 scale-110",
                )}
              />
            )}
            {t("profile")}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
