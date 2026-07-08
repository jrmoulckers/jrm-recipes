"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { primaryNav } from "~/config/nav";
import { cn } from "~/lib/utils";

function isActive(pathname: string, item: (typeof primaryNav)[number]) {
  return item.match ? item.match(pathname) : pathname === item.href;
}

/** Horizontal nav for the desktop header. */
export function MainNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
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
            {item.label}
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
  // Hide chrome in immersive routes (cook mode, print).
  if (pathname.includes("/cook") || pathname.includes("/print")) return null;

  const count = primaryNav.length;
  // First matching tab drives the sliding indicator. Computed from the pathname
  // so it's correct on SSR, initial load, and back/forward — no flash.
  const activeIndex = primaryNav.findIndex((item) => isActive(pathname, item));

  return (
    <nav
      aria-label="Primary mobile"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
    >
      <ul className="relative mx-auto flex max-w-md items-stretch justify-around px-2 pb-safe-b">
        {/* A pill that glides along the top edge to the active tab. */}
        {activeIndex >= 0 && (
          <li
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 top-0 flex h-0.5"
          >
            <span
              className="flex h-full justify-center transition-transform duration-base ease-standard motion-reduce:transition-none"
              style={{
                width: `${100 / count}%`,
                transform: `translateX(${activeIndex * 100}%)`,
              }}
            >
              <span className="h-full w-8 rounded-full bg-primary" />
            </span>
          </li>
        )}
        {primaryNav.map((item) => {
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
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
