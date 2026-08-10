'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { brand } from '~/config/brand';
import { Button } from '~/components/ui/button';
import { useConsent } from '~/components/analytics/consent-provider';

/**
 * A lightweight, non-blocking first-run consent notice (issue #324). It only
 * appears in opt-in mode (`NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT=1`) while the
 * user hasn't chosen and no DNT/GPC signal is present. Until they choose "Allow",
 * the runtime gate keeps every event from being sent.
 */
export function ConsentNotice() {
  const { needsChoice, grant, deny } = useConsent();
  const t = useTranslations('privacy.notice');

  if (!needsChoice) return null;

  return (
    <div
      role="dialog"
      aria-label={t('ariaLabel')}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-border bg-card p-4 shadow-token sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {t('body', { brand: brand.name })}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={deny}>
            {t('decline')}
          </Button>
          <Button size="sm" onClick={grant}>
            {t('allow')}
          </Button>
        </div>
      </div>
    </div>
  );
}
