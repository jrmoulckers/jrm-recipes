'use client';

import * as React from 'react';
import { CheckCircle2, Download, HardDrive, ShieldCheck, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { DIETARY_MODEL } from '~/config/on-device-dietary';
import { track } from '~/lib/analytics';
import { analyzeRecipeOnDevice } from '~/lib/dietary-analysis-client';
import {
  clearDietaryModelData,
  detectDietaryDeviceCapability,
  getDietaryModelInstallation,
  installDietaryModel,
  type DietaryDeviceCapability,
} from '~/lib/dietary-model-storage';
import { stopDietaryAnalysisWorker } from '~/lib/dietary-on-device';
import { listDietaryLibraryScanIdsAction } from '~/server/dietary/actions';
import { Button } from '~/components/ui/button';

type SetupState = 'checking' | 'available' | 'installing' | 'ready' | 'unsupported';

export function SmartDietaryAnalysis({ accountId }: { accountId: string }) {
  const t = useTranslations('dietary.smartAnalysis');
  const [state, setState] = React.useState<SetupState>('checking');
  const [capability, setCapability] = React.useState<DietaryDeviceCapability | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [scan, setScan] = React.useState<{ done: number; total: number } | null>(null);

  React.useEffect(() => {
    let active = true;
    void Promise.all([
      detectDietaryDeviceCapability(),
      getDietaryModelInstallation(accountId),
    ]).then(([nextCapability, installation]) => {
      if (!active) return;
      setCapability(nextCapability);
      setState(
        !nextCapability.supported
          ? 'unsupported'
          : installation?.enabled && installation.revision === DIETARY_MODEL.revision
            ? 'ready'
            : 'available',
      );
      if (!nextCapability.supported) {
        track('dietary_device_support_checked', { support: 'deterministic_only' });
      }
    });
    return () => {
      active = false;
    };
  }, [accountId]);

  async function enable() {
    setState('installing');
    try {
      await installDietaryModel(accountId, (bytes) =>
        setProgress(Math.min(100, Math.round((bytes / DIETARY_MODEL.downloadBytes) * 100))),
      );
      setState('ready');
      track('dietary_analysis_enablement_changed', { enabled: true });
      track('dietary_model_download_finished', { outcome: 'succeeded', errorCode: 'none' });
      toast.success(t('enabled'));
    } catch (error) {
      setState(capability?.supported ? 'available' : 'unsupported');
      const code =
        error instanceof Error && error.message === 'insufficient_storage'
          ? 'insufficient_storage'
          : error instanceof Error && error.message === 'MODEL_INTEGRITY_CHECK_FAILED'
            ? 'integrity_check_failed'
            : 'cache_failed';
      track('dietary_model_download_finished', { outcome: 'failed', errorCode: code });
      toast.error(t('installFailed'));
    }
  }

  async function disable() {
    stopDietaryAnalysisWorker();
    await clearDietaryModelData(accountId);
    setProgress(0);
    setState(capability?.supported ? 'available' : 'unsupported');
    track('dietary_analysis_enablement_changed', { enabled: false });
    toast.success(t('disabled'));
  }

  async function scanLibrary() {
    const result = await listDietaryLibraryScanIdsAction();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setScan({ done: 0, total: result.recipeIds.length });
    for (let index = 0; index < result.recipeIds.length; index++) {
      await analyzeRecipeOnDevice(result.recipeIds[index]!, accountId, 'library_scan');
      setScan({ done: index + 1, total: result.recipeIds.length });
    }
    toast.success(t('scanComplete'));
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-token">
      <div className="flex items-start gap-3">
        <span className="bg-primary/12 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-primary">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold">{t('title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      {state === 'unsupported' ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('unsupported')}</p>
      ) : state === 'ready' ? (
        <div className="mt-5 space-y-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            {t('ready')}
          </p>
          {scan ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t('scanProgress', scan)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void scanLibrary()} disabled={scan?.done !== scan?.total}>
              {t('scan')}
            </Button>
            <Button variant="outline" onClick={() => void disable()}>
              {t('disable')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Download className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('download')}
            </li>
            <li className="flex gap-2">
              <HardDrive className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('storage')}
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('privacy')}
            </li>
          </ul>
          {state === 'installing' ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t('installing', { progress })}
            </p>
          ) : null}
          <Button onClick={() => void enable()} disabled={state !== 'available'}>
            {t('enable')}
          </Button>
        </div>
      )}
    </section>
  );
}
