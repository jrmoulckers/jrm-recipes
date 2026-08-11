'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Clipboard, Download, ImageDown, Mail, Printer, Share2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
  buildShoppingListMailto,
  copyShoppingExportText,
  createShoppingExportDocument,
  detectShoppingExportCapabilities,
  downloadShoppingExportText,
  downloadShoppingListImage,
  openShoppingListPrintView,
  serializeShoppingExportText,
  shoppingExportFilename,
  ShoppingExportError,
  visibleShoppingExportItems,
  type ShoppingExportCapabilities,
} from '~/lib/shopping-export';
import { describeQuantity } from '~/lib/shopping-list';
import type { ShoppingListOption, ShoppingViewItem } from './shopping-list-view';
import { useShoppingCategoryLabels } from './shopping-localization';

const NO_CAPABILITIES: ShoppingExportCapabilities = {
  clipboard: false,
  fileDownload: false,
  imageDownload: false,
  nativeShare: false,
  printView: false,
};

function isShareCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function ShoppingListExportMenu({
  items,
  list,
  disabled,
}: {
  items: ShoppingViewItem[];
  list: ShoppingListOption;
  disabled: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('shopping');
  const categoryLabels = useShoppingCategoryLabels();
  const [includeChecked, setIncludeChecked] = React.useState(false);
  const [busy, setBusy] = React.useState<'image' | 'native' | null>(null);
  const [capabilities, setCapabilities] =
    React.useState<ShoppingExportCapabilities>(NO_CAPABILITIES);

  React.useEffect(() => {
    setCapabilities(detectShoppingExportCapabilities());
  }, []);

  const exportItems = items.map((item) => {
    if (item.packageCount == null || item.purchaseQuantity == null || !item.purchaseUnit) {
      return item;
    }
    const purchaseQuantity = describeQuantity(
      {
        quantity: item.purchaseQuantity,
        quantityMax: null,
        unit: item.purchaseUnit,
      },
      locale,
    );
    const guidance = item.packageLabel
      ? t('package.guidance.withLabel', {
          count: item.packageCount,
          label: item.packageLabel,
          quantity: purchaseQuantity,
        })
      : t('package.guidance.packages', {
          count: item.packageCount,
          quantity: purchaseQuantity,
        });
    return {
      ...item,
      note: [item.note, guidance].filter(Boolean).join(' · '),
    };
  });
  const exportDocument = createShoppingExportDocument({
    listName: list.name,
    storeNames: list.storeNames,
    storeLabel: t('export.storeLabel', { count: list.storeNames.length }),
    locale,
    categoryLabels,
    items: exportItems,
    includeChecked,
  });
  const checkedCount = items.filter((item) => item.checked).length;

  function textOrNotify(): string | null {
    const text = serializeShoppingExportText(exportDocument);
    if (!text) toast.info(t('export.toasts.nothingToExport'));
    return text || null;
  }

  function showError(error: unknown, fallback: string) {
    if (error instanceof ShoppingExportError) {
      const keyByCode = {
        'clipboard-unavailable': 'export.errors.clipboardUnavailable',
        'download-unavailable': 'export.errors.downloadUnavailable',
        'image-unavailable': 'export.errors.imageUnavailable',
        'image-too-large': 'export.errors.imageTooLarge',
        'popup-blocked': 'export.errors.popupBlocked',
      } as const;
      toast.error(t(keyByCode[error.code]));
      return;
    }
    toast.error(fallback);
  }

  async function copyText() {
    const text = textOrNotify();
    if (!text) return;
    try {
      await copyShoppingExportText(text);
      toast.success(t('export.toasts.copied'));
    } catch (error) {
      showError(error, t('export.errors.copyFailed'));
    }
  }

  function downloadText() {
    if (!textOrNotify()) return;
    try {
      downloadShoppingExportText(exportDocument);
      toast.success(
        t('export.toasts.downloaded', {
          filename: shoppingExportFilename(exportDocument, 'txt'),
        }),
      );
    } catch (error) {
      showError(error, t('export.errors.downloadFailed'));
    }
  }

  function emailList() {
    const text = textOrNotify();
    if (!text) return;
    const mailto = buildShoppingListMailto(t('export.emailSubject', { listName: list.name }), text);
    if (!mailto.ok) {
      toast.error(t('export.errors.emailTooLong'));
      return;
    }
    try {
      window.location.assign(mailto.href);
    } catch {
      toast.error(t('export.errors.emailFailed'));
    }
  }

  function printList() {
    if (visibleShoppingExportItems(exportDocument).length === 0) {
      toast.info(t('export.toasts.nothingToExport'));
      return;
    }
    try {
      openShoppingListPrintView(exportDocument, {
        print: t('export.actions.print'),
        close: t('export.actions.closePrint'),
        completed: t('export.completed'),
      });
    } catch (error) {
      showError(error, t('export.errors.printFailed'));
    }
  }

  async function downloadImage() {
    if (busy) return;
    if (visibleShoppingExportItems(exportDocument).length === 0) {
      toast.info(t('export.toasts.nothingToExport'));
      return;
    }
    setBusy('image');
    try {
      await downloadShoppingListImage(exportDocument);
      toast.success(t('export.toasts.imageDownloaded'));
    } catch (error) {
      showError(error, t('export.errors.imageFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function nativeShare() {
    if (busy) return;
    const text = textOrNotify();
    if (!text || typeof navigator.share !== 'function') return;
    setBusy('native');
    try {
      await navigator.share({
        title: t('export.emailSubject', { listName: list.name }),
        text,
      });
    } catch (error) {
      if (!isShareCancellation(error)) {
        toast.error(t('export.errors.nativeShareFailed'));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || items.length === 0}
          aria-disabled={busy !== null}
          onClick={(event) => {
            if (busy) event.preventDefault();
          }}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          <Share2 aria-hidden="true" />
          {busy === 'image' ? t('export.actions.preparingImage') : t('export.trigger')}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <span className="sr-only" role="status" aria-live="polite">
        {busy === 'image' ? t('export.actions.preparingImage') : ''}
      </span>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>{t('export.menuLabel')}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={includeChecked}
          disabled={checkedCount === 0}
          onCheckedChange={(checked) => setIncludeChecked(checked === true)}
          onSelect={(event) => event.preventDefault()}
        >
          <span className="flex min-w-0 flex-col">
            <span>{t('export.includeCompleted')}</span>
            <span className="whitespace-normal text-xs font-normal text-muted-foreground">
              {t('export.includeCompletedHint', { count: checkedCount })}
            </span>
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void copyText()}>
          <Clipboard aria-hidden="true" />
          {t('export.actions.copyText')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={downloadText}>
          <Download aria-hidden="true" />
          {t('export.actions.downloadText')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={emailList}>
          <Mail aria-hidden="true" />
          {t('export.actions.email')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={printList}>
          <Printer aria-hidden="true" />
          {t('export.actions.print')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void downloadImage()}>
          <ImageDown aria-hidden="true" />
          {t('export.actions.downloadImage')}
        </DropdownMenuItem>
        {capabilities.nativeShare ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void nativeShare()}>
              <Share2 aria-hidden="true" />
              {t('export.actions.nativeShare')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
