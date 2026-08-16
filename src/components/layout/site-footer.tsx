'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { brand } from '~/config/brand';
import { footerNav } from '~/config/nav';
import { Logo } from '~/components/layout/logo';
import { InstallAppButton } from '~/components/pwa/install-app-button';

export function SiteFooter() {
  const t = useTranslations('footer');

  return (
    <footer className="no-print border-t border-border bg-surface">
      <div className="container flex flex-col gap-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="flex flex-col gap-1">
          <Logo />
          <p className="max-w-xs text-xs">{brand.tagline}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <nav aria-label={t('landmark')} className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/recipes" className="hover:text-foreground">
              {t('recipes')}
            </Link>
            <Link href="/groups" className="hover:text-foreground">
              {t('family')}
            </Link>
            <Link href="/recipes/new" className="hover:text-foreground">
              {t('create')}
            </Link>
            {footerNav.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-foreground">
                {t(item.labelKey)}
              </Link>
            ))}
            {brand.links.github && (
              <a
                href={brand.links.github}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground"
              >
                {t('github')}
              </a>
            )}
          </nav>
          <InstallAppButton />
        </div>
      </div>
    </footer>
  );
}
