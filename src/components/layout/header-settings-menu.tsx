'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { ThemeSwitcher } from '~/components/theme/theme-switcher';
import { KidsModeToggle } from '~/components/theme/kids-mode-toggle';
import { LocaleSwitcher } from '~/components/i18n/locale-switcher';
import { AccessibilityMenu } from '~/components/a11y/accessibility-menu';
import { OfflineStorageMenu } from '~/components/pwa/offline-storage-menu';

/**
 * Single header entry point that collapses the device-level utility controls
 * (appearance, Kids mode, language, accessibility, offline storage) behind one
 * icon button instead of a five-icon row. This keeps the top-right cluster to a
 * clean, scannable line: search, create, settings, notifications, and account
 * rather than the dense wall of look-alike icons it had grown into.
 *
 * Each control already ships a `label` mode that renders it as a full-width,
 * left-aligned row (the same rows used in the mobile Profile hub), so the panel
 * reuses those verbatim. Radix's layered dismiss handling lets each row open its
 * own dropdown/dialog from inside this popover without collapsing it.
 */
export function HeaderSettingsMenu() {
  const t = useTranslations('nav');
  const tp = useTranslations('profile.preferences');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t('settings')}>
          <SlidersHorizontal className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('settings')}
        </p>
        <ul className="grid gap-0.5">
          <li>
            <ThemeSwitcher label={tp('appearance')} />
          </li>
          <li>
            <KidsModeToggle label={tp('kidsMode')} />
          </li>
          <li>
            <LocaleSwitcher label={tp('language')} />
          </li>
          <li>
            <AccessibilityMenu label={tp('accessibility')} />
          </li>
          <li>
            <OfflineStorageMenu label={tp('offline')} />
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
