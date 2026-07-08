"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { brand } from "~/config/brand";
import { Logo } from "~/components/layout/logo";

export function SiteFooter() {
  const t = useTranslations("footer");

  return (
    <footer className="no-print border-t border-border bg-surface">
      <div className="container flex flex-col gap-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <Logo />
          <p className="max-w-xs text-xs">{brand.tagline}</p>
        </div>
        <nav
          aria-label={t("landmark")}
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          <Link href="/recipes" className="hover:text-foreground">
            {t("recipes")}
          </Link>
          <Link href="/groups" className="hover:text-foreground">
            {t("family")}
          </Link>
          <Link href="/recipes/new" className="hover:text-foreground">
            {t("create")}
          </Link>
          {brand.links.github && (
            <a
              href={brand.links.github}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              GitHub
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
