'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { toast } from 'sonner';

import { friendlyError } from '~/lib/error-copy';
import { Switch } from '~/components/ui/switch';
import { setPublicActivityOptInAction } from '~/server/follows/actions';

/**
 * Public-activity opt-in toggle. Optimistic switch backed by
 * {@link setPublicActivityOptInAction}. Reverts + toasts on failure. Default
 * off. A user is only discoverable / followable once they turn this on.
 */
export function PublicActivityOptIn({ defaultOptedIn }: { defaultOptedIn: boolean }) {
  const t = useTranslations('settings.publicActivity');
  const [optedIn, setOptedIn] = React.useState(defaultOptedIn);
  const [isPending, startTransition] = React.useTransition();

  function handleChange(next: boolean) {
    const previous = optedIn;
    setOptedIn(next);
    startTransition(async () => {
      const result = await setPublicActivityOptInAction(next);
      if (!result.ok) {
        setOptedIn(previous);
        toast.error(friendlyError(result.error));
        return;
      }
      toast.success(next ? t('toasts.visible') : t('toasts.private'));
    });
  }

  return (
    <section className="flex items-start gap-3 rounded-xl border border-border bg-surface/40 p-4">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <Globe className="size-5" aria-hidden="true" />
      </span>
      <label htmlFor="public-activity" className="min-w-0 flex-1 cursor-pointer select-none">
        <span className="block text-sm font-medium">{t('label')}</span>
        <span className="block text-xs text-muted-foreground">
          {t.rich('description', {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </span>
      </label>
      <Switch
        id="public-activity"
        checked={optedIn}
        disabled={isPending}
        onCheckedChange={handleChange}
      />
    </section>
  );
}
