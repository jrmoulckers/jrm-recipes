"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";

import { cn } from "~/lib/utils";

export type BreadcrumbItem = {
  label: string;
  /** Omit on the final (current) crumb, which renders as plain text. */
  href?: Route;
};

/**
 * Localized, RTL-aware breadcrumb trail for deep routes (e.g. a recipe's edit
 * screen, group settings, or account settings) where the header nav alone
 * doesn't convey where the user is in the hierarchy.
 *
 * Presentational and opt-in: pages pass an already-resolved list of crumbs so
 * the component stays free of route-parsing assumptions. The landmark label
 * comes from the `nav` catalog, the separator flips for RTL, and the last crumb
 * is marked `aria-current="page"`.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  const t = useTranslations("nav");
  if (items.length === 0) return null;

  return (
    <nav
      aria-label={t("landmarks.breadcrumb")}
      className={cn("min-w-0", className)}
    >
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={`${item.label}-${index}`}
              className="flex items-center gap-1.5"
            >
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(isLast && "font-medium text-foreground")}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground/60 rtl:rotate-180"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
