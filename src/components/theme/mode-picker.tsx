'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

import { UI_THEMES } from '~/config/themes';
import { useTheme } from '~/components/theme/theme-provider';
import { ThemeSwatch } from '~/components/theme/theme-swatch';
import { cn } from '~/lib/utils';

/**
 * Landing-page "try it live" mode picker. Applies each UI mode instantly so
 * visitors feel the theming system before signing up.
 */
export function ModePicker() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {UI_THEMES.map((themeOption) => {
        const active = themeOption.id === theme;
        return (
          <button
            key={themeOption.id}
            type="button"
            onClick={() => setTheme(themeOption.id)}
            aria-pressed={active}
            className={cn(
              'group relative flex flex-col gap-3 rounded-xl border-2 bg-card p-4 text-start transition-all hover:-translate-y-0.5 hover:shadow-token-lg',
              active ? 'border-primary shadow-token' : 'border-border',
            )}
          >
            <ThemeSwatch theme={themeOption.id} size="lg" />
            <span>
              <span className="flex items-center gap-1.5 font-display text-base font-semibold">
                {t(`themes.${themeOption.id}.label`)}
                {active && <Check className="size-4 text-primary" />}
              </span>
              <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {t(`themes.${themeOption.id}.description`)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
