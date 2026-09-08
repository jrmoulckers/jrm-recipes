'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';

import { Button } from '~/components/ui/button';

const QuickCaptureDialogContent = dynamic(
  () =>
    import('~/components/recipe/quick-capture-dialog-content').then(
      (module) => module.QuickCaptureDialogContent,
    ),
  { ssr: false },
);

export function QuickCaptureDialog() {
  const t = useTranslations('recipe');
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button type="button" size="lg" variant="outline" onClick={() => setOpen(true)}>
        <Sparkles /> {t('quickCapture.trigger')}
      </Button>
      {open ? <QuickCaptureDialogContent open onOpenChange={setOpen} /> : null}
    </>
  );
}
