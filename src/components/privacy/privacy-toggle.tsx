'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { brand } from '~/config/brand';
import { Switch } from '~/components/ui/switch';
import { useConsent } from '~/components/analytics/consent-provider';

/**
 * Analytics opt-out control (issue #324) for the preferences panel. Flipping it
 * off calls the backend's opt-out + reset via the consent provider. A browser
 * DNT/GPC signal forces it off and disabled.
 */
export function PrivacyToggle() {
  const { captureAllowed, privacySignal, grant, deny } = useConsent();
  const t = useTranslations('privacy.toggle');

  return (
    <section className="flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-muted/60">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <ShieldCheck className="size-5" />
      </span>
      <label htmlFor="analytics-consent" className="min-w-0 flex-1 cursor-pointer select-none">
        <span className="block text-sm font-medium">{t('label')}</span>
        <span className="block text-xs text-muted-foreground">
          {t('description', { brand: brand.name })}
        </span>
        {privacySignal && (
          <span className="mt-1 block text-xs font-medium text-muted-foreground">
            {t('signalOn')}
          </span>
        )}
      </label>
      <Switch
        id="analytics-consent"
        checked={captureAllowed}
        disabled={privacySignal}
        onCheckedChange={(v) => (v ? grant() : deny())}
      />
    </section>
  );
}
