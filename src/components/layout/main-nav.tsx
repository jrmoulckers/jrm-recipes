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
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
              active
                ? "font-semibold text-foreground underline decoration-2 underline-offset-4"
                : "text-muted-foreground",
            )}
          >
            {item.label}
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

  return (
    <nav
      aria-label="Primary mobile"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {primaryNav.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[0.7rem] font-medium transition-colors",
                  active ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
