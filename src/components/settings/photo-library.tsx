'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ImageOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { formatDate } from '~/lib/dates';
import { cn } from '~/lib/utils';
import {
  deleteAssetAction,
  getAssetUsageAction,
  listAssetsAction,
  updateAltTextAction,
} from '~/server/media/actions';
import { ASSET_USAGE_SURFACES, type AssetUsageSurface } from '~/server/media/usage-surfaces';
import { Button } from '~/components/ui/button';
import { useConfirm } from '~/components/ui/confirm-dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

/**
 * The photo library grid for `/settings/photos` (issue #658, epic #655).
 *
 * Only the fields the surface renders are carried across the server/client
 * boundary, declared here rather than imported from the `server-only` query
 * module. Dates arrive pre-serialized as ISO strings.
 */
export type LibraryAsset = {
  id: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  createdAt: string;
};

/** The surfaces `getAssetUsage` counts, in the order the dialog names them. */
const USAGE_SURFACES: readonly AssetUsageSurface[] = ASSET_USAGE_SURFACES;

/**
 * Bytes → a short human size. Cloudinary reports exact byte counts, which are
 * unreadable at photo scale, so promote to kB/MB and keep one decimal.
 */
function formatNumber(value: number, locale: string): string {
  return value.toLocaleString(locale);
}

function formatBytes(bytes: number, locale: string): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
  }
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb.toLocaleString(locale)} kB`;
}

export function PhotoLibrary({
  initialAssets,
  initialCursor,
}: {
  initialAssets: LibraryAsset[];
  initialCursor: string | null;
}) {
  const t = useTranslations('settings.photosPage');
  const locale = useLocale();
  const confirm = useConfirm();

  const [assets, setAssets] = React.useState(initialAssets);
  const [cursor, setCursor] = React.useState(initialCursor);
  const [loading, setLoading] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialAssets[0]?.id ?? null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const [altDraft, setAltDraft] = React.useState(initialAssets[0]?.altText ?? '');
  const [status, setStatus] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [broken, setBroken] = React.useState<Record<string, boolean>>({});

  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const altId = React.useId();

  const selected = assets.find((asset) => asset.id === selectedId) ?? null;

  function describe(asset: LibraryAsset): string {
    return asset.altText ?? t('untitledPhoto');
  }

  function select(asset: LibraryAsset) {
    setSelectedId(asset.id);
    setAltDraft(asset.altText ?? '');
    setStatus('');
    setError(null);
  }

  /**
   * Roving tabindex over the thumbnails, matching the picker's library tab: the
   * whole grid is one stop in the page's tab order and the arrow keys move
   * within it, which is how a picture grid should behave. Details and
   * destructive actions live in the panel below, so a photo is never one
   * keystroke from deletion.
   */
  function move(next: number) {
    if (assets.length === 0) return;
    const index = (next + assets.length) % assets.length;
    setFocusIndex(index);
    itemRefs.current[index]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(focusIndex + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(focusIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(assets.length - 1);
        break;
      default:
        break;
    }
  }

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    const result = await listAssetsAction({ cursor });
    if (result.ok) {
      setAssets((prev) => [
        ...prev,
        ...result.page.assets.map((asset) => ({
          id: asset.id,
          url: asset.url,
          altText: asset.altText,
          width: asset.width,
          height: asset.height,
          bytes: asset.bytes,
          createdAt: asset.createdAt.toISOString(),
        })),
      ]);
      setCursor(result.page.nextCursor);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  async function saveAltText() {
    if (!selected) return;
    setBusy(true);
    const result = await updateAltTextAction({
      id: selected.id,
      altText: altDraft,
    });
    if (result.ok) {
      const next = altDraft.trim();
      setAssets((prev) =>
        prev.map((asset) =>
          asset.id === selected.id ? { ...asset, altText: next.length > 0 ? next : null } : asset,
        ),
      );
      setStatus(t('altSaved'));
      setError(null);
    } else {
      setError(result.error);
    }
    setBusy(false);
  }

  /**
   * Deleting a photo that is still on a recipe is the sharp edge here, so the
   * usage lookup runs at this moment — when the dialog is about to open — and
   * never on grid render, where it would be six queries per thumbnail.
   */
  async function onDelete() {
    if (!selected) return;

    setBusy(true);
    const usageResult = await getAssetUsageAction(selected.id);
    setBusy(false);

    if (!usageResult.ok) {
      setError(usageResult.error);
      return;
    }

    const { total, bySurface } = usageResult.usage;
    const places = USAGE_SURFACES.filter((surface) => bySurface[surface] > 0).map((surface) =>
      t(`usage.surfaces.${surface}`, { count: bySurface[surface] }),
    );

    const ok = await confirm({
      // The dialog names the exact photo, never "this item".
      title: t('deleteConfirm.title', { name: describe(selected) }),
      description:
        total > 0
          ? t('deleteConfirm.inUse', {
              count: total,
              places: places.join(t('usage.separator')),
            })
          : t('deleteConfirm.unused'),
      confirmLabel: t('deleteConfirm.confirmLabel'),
    });
    if (!ok) return;

    setBusy(true);
    const result = await deleteAssetAction(selected.id);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const remaining = assets.filter((asset) => asset.id !== selected.id);
    setAssets(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    setAltDraft(remaining[0]?.altText ?? '');
    setFocusIndex(0);
    setError(null);
    setStatus('');
    toast.success(t('deleteConfirm.deleted'));
  }

  if (assets.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="listbox"
        aria-label={t('gridLabel')}
        onKeyDown={onKeyDown}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      >
        {assets.map((asset, index) => {
          const isSelected = asset.id === selectedId;
          return (
            <button
              key={asset.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-label={describe(asset)}
              tabIndex={index === focusIndex ? 0 : -1}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              onFocus={() => setFocusIndex(index)}
              onClick={() => select(asset)}
              className={cn(
                'relative aspect-square overflow-hidden rounded-xl border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected && 'ring-2 ring-primary',
              )}
            >
              {broken[asset.id] ? (
                <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
                  <ImageOff className="size-5" aria-hidden="true" />
                  {t('unavailable')}
                </span>
              ) : (
                /* Decorative: the button already carries the photo's name, so a
                   second copy on the image would double-announce it. */
                /* eslint-disable-next-line @next/next/no-img-element -- library thumbnails come from arbitrary stored URLs that can't be pre-allowlisted for next/image */
                <img
                  src={asset.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={() => setBroken((prev) => ({ ...prev, [asset.id]: true }))}
                  className="size-full object-cover"
                />
              )}
            </button>
          );
        })}
      </div>

      {cursor ? (
        <Button
          type="button"
          variant="outline"
          className="self-center"
          loading={loading}
          onClick={() => void loadMore()}
        >
          {t('loadMore')}
        </Button>
      ) : null}

      {selected ? (
        <section
          aria-label={t('detailsLabel')}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-token"
        >
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {describe(selected)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {[
                selected.width && selected.height
                  ? `${formatNumber(selected.width, locale)} × ${formatNumber(
                      selected.height,
                      locale,
                    )}`
                  : null,
                selected.bytes ? formatBytes(selected.bytes, locale) : null,
                t('uploaded', {
                  date: formatDate(new Date(selected.createdAt), 'PP', locale),
                }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={altId}>{t('altLabel')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={altId}
                value={altDraft}
                maxLength={300}
                className="flex-1"
                placeholder={t('altPlaceholder')}
                onChange={(event) => {
                  setAltDraft(event.target.value);
                  setStatus('');
                }}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void saveAltText()}
              >
                {t('altSave')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('altHint')}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Politely announced so a save is perceivable without sight. */}
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {status}
            </p>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void onDelete()}
            >
              <Trash2 /> {t('delete')}
            </Button>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
