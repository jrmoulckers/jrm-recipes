'use client';

import { useTranslations } from 'next-intl';
import { Printer } from 'lucide-react';

import { Button } from '~/components/ui/button';

/**
 * Prints the current keepsake page (issue #407). Trivial wrapper around
 * `window.print()` so the surrounding keepsake view can stay a server
 * component. It is hidden on paper via `print:hidden` at the call site.
 */
export function KeepsakePrintButton() {
  const t = useTranslations('keepsake');
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <Printer aria-hidden="true" /> {t('print')}
    </Button>
  );
}
