'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Printer } from 'lucide-react';

import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { KEEPSAKE_NOTE_MAX } from '~/lib/keepsake';

/**
 * Opens the printable booklet for a collection (issue #397), optionally with a
 * dedication for the cover. The dedication rides in the print URL (no server
 * round-trip). The print page turns "Print → Save as PDF" into a real family
 * cookbook.
 */
export function PrintCookbookButton({ collectionId }: { collectionId: string }) {
  const router = useRouter();
  const t = useTranslations('collections.print');
  const [dedication, setDedication] = React.useState('');

  function openPrint() {
    const trimmed = dedication.trim();
    if (trimmed) {
      const qs = new URLSearchParams({ dedication: trimmed }).toString();
      router.push(`/collections/${collectionId}/print?${qs}`);
    } else {
      router.push(`/collections/${collectionId}/print`);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Printer /> {t('trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cookbook-dedication">{t('dedication.label')}</Label>
          <Textarea
            id="cookbook-dedication"
            value={dedication}
            onChange={(event) => setDedication(event.target.value)}
            placeholder={t('dedication.placeholder')}
            rows={3}
            maxLength={KEEPSAKE_NOTE_MAX}
          />
        </div>

        <DialogFooter>
          <Button type="button" onClick={openPrint}>
            <Printer /> {t('openPrint')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
