'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Mic, Square } from 'lucide-react';

import { cn } from '~/lib/utils';
import { useReducedMotion } from '~/lib/use-reduced-motion';
import { useSpeechInput } from '~/lib/use-speech-input';

/**
 * A small per-field microphone that dictates into a text field (issue #373).
 *
 * Transcribed speech is appended to the field (never overwritten) via
 * `onAppend`. On browsers without SpeechRecognition (notably iOS Safari) the
 * button renders disabled with a plain-language tooltip so nothing looks
 * broken. The listening pulse is suppressed under prefers-reduced-motion.
 */
export function DictationButton({
  fieldLabel,
  onAppend,
  className,
}: {
  fieldLabel: string;
  onAppend: (text: string) => void;
  className?: string;
}) {
  const t = useTranslations('recipe');
  const reduced = useReducedMotion();
  const { supported, listening, toggle } = useSpeechInput({
    onResult: onAppend,
  });

  const base =
    'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title={t('dictation.unavailable')}
        aria-label={t('dictation.unavailableFor', { field: fieldLabel })}
        className={cn(
          base,
          'cursor-not-allowed border-border text-muted-foreground opacity-60',
          className,
        )}
      >
        <Mic className="size-3.5" aria-hidden="true" /> {t('dictation.speak')}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={listening}
      aria-label={
        listening
          ? t('dictation.stopAria', { field: fieldLabel })
          : t('dictation.startAria', { field: fieldLabel })
      }
      className={cn(
        base,
        listening
          ? 'border-destructive/50 bg-destructive/10 text-destructive'
          : 'border-border text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {listening ? (
        <>
          <Square className="size-3.5" aria-hidden="true" />
          <span className={cn(!reduced && 'animate-pulse')}>{t('dictation.listening')}</span>
        </>
      ) : (
        <>
          <Mic className="size-3.5" aria-hidden="true" /> {t('dictation.speak')}
        </>
      )}
    </button>
  );
}
