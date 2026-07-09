"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MoreHorizontal } from "lucide-react";

import {
  mobileMoreNav,
  mobilePrimaryNav,
  primaryNav,
  type NavItem,
} from "~/config/nav";
import { cn } from "~/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

function isActive(pathname: string, item: NavItem) {
  return item.match ? item.match(pathname) : pathname === item.href;
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
              active ? "font-semibold text-foreground" : "text-muted-foreground",
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

/** App-like bottom tab bar for mobile. */
export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
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

  // A phone bottom bar reads best with a handful of primary tabs plus a "More"
  // menu, so we surface the curated `mobilePrimaryNav` set as tabs and overflow
  // the rest into a menu rather than cramming all nine destinations in.
  const tabs = mobilePrimaryNav;
  const hasMore = mobileMoreNav.length > 0;
  const count = tabs.length + (hasMore ? 1 : 0);
  // First matching tab drives the sliding indicator. Computed from the pathname
  // so it's correct on SSR, initial load, and back/forward — no flash.
  const activeIndex = tabs.findIndex((item) => isActive(pathname, item));
  // When the active route lives in the overflow set, highlight the More tab
  // (the last slot) instead of leaving nothing active.
  const moreActive = hasMore && mobileMoreNav.some((item) => isActive(pathname, item));
  const indicatorIndex =
    activeIndex >= 0 ? activeIndex : moreActive ? count - 1 : -1;

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
                  active ? "font-semibold text-primary" : "text-muted-foreground",
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
        {hasMore && (
          <li className="flex-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-current={moreActive ? "page" : undefined}
                className={cn(
                  "flex w-full flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[0.7rem] font-medium outline-none transition-colors active:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  moreActive
                    ? "font-semibold text-primary"
                    : "text-muted-foreground",
                )}
              >
                <MoreHorizontal
                  className={cn(
                    "size-5 transition-transform duration-base ease-standard motion-reduce:transition-none",
                    moreActive && "-translate-y-0.5 scale-110",
                  )}
                />
                {t("more")}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="end"
                className="mb-1 min-w-[12rem]"
              >
                {mobileMoreNav.map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(active && "font-semibold text-primary")}
                      >
                        <Icon className="size-4" />
                        {t(item.labelKey)}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )}
      </ul>
    </nav>
  );
}
