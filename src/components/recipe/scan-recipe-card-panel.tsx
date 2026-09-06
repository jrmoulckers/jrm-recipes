'use client';

import * as React from 'react';
import { AlertTriangle, Camera, ImagePlus, ShieldCheck } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { importRecipeTextAction } from '~/server/recipes/actions';
import type { ImportedRecipe } from '~/server/recipes/import';
import { RECIPE_CARD_OCR_LANGUAGES, type RecipeCardOcrLanguage } from '~/lib/recipe-card-ocr';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const LOCALE_LANGUAGE: Record<string, RecipeCardOcrLanguage> = {
  ar: 'ara',
  de: 'deu',
  en: 'eng',
  es: 'spa',
};

type ScanState = 'idle' | 'reading' | 'review';

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Recipe card scan cancelled.', 'AbortError'));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException('Recipe card scan cancelled.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export function ScanRecipeCardPanel({
  onImported,
}: {
  onImported: (recipe: ImportedRecipe) => boolean | void | Promise<boolean | void>;
}) {
  const t = useTranslations('recipe.import.scan');
  const locale = useLocale();
  const format = useFormatter();
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const scanButtonRef = React.useRef<HTMLButtonElement>(null);
  const readingHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const reviewHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const restoreScanFocusRef = React.useRef(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [language, setLanguage] = React.useState<RecipeCardOcrLanguage>(
    LOCALE_LANGUAGE[locale.split('-')[0] ?? 'en'] ?? 'eng',
  );
  const [state, setState] = React.useState<ScanState>('idle');
  const [progress, setProgress] = React.useState(0);
  const [transcript, setTranscript] = React.useState('');
  const [parsedTranscript, setParsedTranscript] = React.useState('');
  const [parsedRecipe, setParsedRecipe] = React.useState<ImportedRecipe | null>(null);
  const [confidence, setConfidence] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isApplying, setIsApplying] = React.useState(false);
  const isBusy = state === 'reading' || isApplying;

  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  React.useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  React.useEffect(() => {
    if (state === 'reading') {
      readingHeadingRef.current?.focus();
    } else if (state === 'review') {
      reviewHeadingRef.current?.focus();
    } else if (restoreScanFocusRef.current) {
      restoreScanFocusRef.current = false;
      scanButtonRef.current?.focus();
    }
  }, [state]);

  const clearResult = React.useCallback(() => {
    setState('idle');
    setProgress(0);
    setTranscript('');
    setParsedTranscript('');
    setParsedRecipe(null);
    setConfidence(null);
    setError(null);
  }, []);

  const discardPhoto = () => {
    clearResult();
    setFile(null);
    setPreviewUrl(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  const chooseAnotherPhoto = () => {
    discardPhoto();
    uploadInputRef.current?.click();
  };

  const selectFile = (selected: File | undefined) => {
    if (!selected) return;
    clearResult();

    if (!ACCEPTED_IMAGE_TYPES.has(selected.type)) {
      setFile(null);
      setPreviewUrl(null);
      setError(t('errors.type'));
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setFile(null);
      setPreviewUrl(null);
      setError(t('errors.size'));
      return;
    }

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const parseTranscript = async (text: string) => {
    const result = await importRecipeTextAction(text, language);
    if (!result.ok) {
      throw new Error('parse_failed');
    }
    return result.recipe;
  };

  const scan = async () => {
    if (!file) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setState('reading');
    setProgress(0);
    setError(null);

    try {
      const { recognizeRecipeCard } = await import('~/lib/recipe-card-ocr');
      const result = await recognizeRecipeCard(file, language, {
        signal: controller.signal,
        onProgress: ({ progress: nextProgress }) => {
          setProgress(Math.max(0, Math.min(1, nextProgress)));
        },
      });

      if (!result.text.trim()) {
        setState('idle');
        setError(t('errors.noText'));
        return;
      }

      const recipe = await abortable(parseTranscript(result.text), controller.signal);
      if (controller.signal.aborted) {
        throw new DOMException('Recipe card scan cancelled.', 'AbortError');
      }
      setTranscript(result.text);
      setParsedTranscript(result.text);
      setParsedRecipe(recipe);
      setConfidence(result.confidence);
      setState('review');
    } catch (scanError) {
      if (isAbortError(scanError) || controller.signal.aborted) {
        restoreScanFocusRef.current = true;
        setState('idle');
        setError(t('errors.cancelled'));
      } else {
        setState('idle');
        setError(t('errors.read'));
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const apply = async () => {
    if (!parsedRecipe || !transcript.trim()) return;
    setIsApplying(true);
    setError(null);

    try {
      const recipe =
        transcript === parsedTranscript ? parsedRecipe : await parseTranscript(transcript);
      if ((await onImported(recipe)) !== false) {
        discardPhoto();
        toast.success(t('applied'));
      }
    } catch {
      setError(t('errors.parse'));
    } finally {
      setIsApplying(false);
    }
  };

  const confidenceMessage =
    confidence !== null && confidence < 55
      ? t('confidence.low')
      : confidence !== null && confidence < 80
        ? t('confidence.mixed')
        : t('confidence.good');

  return (
    <div className="space-y-4 pt-1">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {state === 'reading' ? t('reading') : state === 'review' ? t('reviewTitle') : ''}
      </p>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <div>
            <p className="font-medium">{t('privateTitle')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('privateDescription')}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="scan-language">{t('languageLabel')}</Label>
        <Select
          value={language}
          onValueChange={(value) => setLanguage(value as RecipeCardOcrLanguage)}
          disabled={state !== 'idle' || isApplying}
        >
          <SelectTrigger id="scan-language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RECIPE_CARD_OCR_LANGUAGES.map((code) => (
              <SelectItem key={code} value={code}>
                {t(`languages.${code}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t('languageHelp')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isBusy}
        >
          <Camera aria-hidden="true" />
          {t('takePhoto')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => uploadInputRef.current?.click()}
          disabled={isBusy}
        >
          <ImagePlus aria-hidden="true" />
          {t('choosePhoto')}
        </Button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="sr-only"
          aria-label={t('takePhoto')}
          disabled={isBusy}
          onChange={(event) => selectFile(event.target.files?.[0])}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={t('choosePhoto')}
          disabled={isBusy}
          onChange={(event) => selectFile(event.target.files?.[0])}
        />
      </div>

      {previewUrl && (
        <figure className="overflow-hidden rounded-lg border border-border bg-muted/20 p-2">
          {/* Blob URLs are local previews and are not supported by next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={t('previewAlt')}
            className="mx-auto max-h-72 rounded-md object-contain"
          />
          <figcaption className="mt-2 text-center text-xs text-muted-foreground">
            {t('previewCaption')}
          </figcaption>
        </figure>
      )}

      {error && (
        <div
          role="alert"
          className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {state === 'reading' && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <h3 ref={readingHeadingRef} tabIndex={-1} className="font-medium focus:outline-none">
            {t('reading')}
          </h3>
          <div
            role="progressbar"
            aria-label={t('progressLabel')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('progress', {
              progress: format.number(progress, {
                style: 'percent',
                maximumFractionDigits: 0,
              }),
            })}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => abortControllerRef.current?.abort()}
          >
            {t('cancel')}
          </Button>
        </div>
      )}

      {state === 'review' && (
        <div className="space-y-4 rounded-lg border border-warning/50 bg-warning/10 p-4">
          <div>
            <h3
              ref={reviewHeadingRef}
              tabIndex={-1}
              className="font-display text-lg font-semibold focus:outline-none"
            >
              {t('reviewTitle')}
            </h3>
            <p className="mt-1 text-sm">{t('reviewDescription')}</p>
            <p className="mt-2 text-sm font-medium">{confidenceMessage}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scan-transcript">{t('transcriptLabel')}</Label>
            <Textarea
              id="scan-transcript"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              rows={10}
              dir="auto"
              aria-describedby="scan-transcript-help"
            />
            <p id="scan-transcript-help" className="text-xs text-muted-foreground">
              {t('transcriptHelp')}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={() => void apply()}
              loading={isApplying}
              disabled={!transcript.trim()}
            >
              {t('apply')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={chooseAnotherPhoto}
              disabled={isApplying}
            >
              {t('tryAgain')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('sourceImageHelp')}</p>
        </div>
      )}

      {file && state === 'idle' && (
        <Button ref={scanButtonRef} type="button" onClick={() => void scan()}>
          <Camera aria-hidden="true" />
          {t('scan')}
        </Button>
      )}
    </div>
  );
}
