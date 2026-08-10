import { brand } from '~/config/brand';
import { localeDirection, type Direction } from '~/config/i18n';
import { formatList } from '~/lib/i18n-format';
import {
  formatShoppingListItemLine,
  formatShoppingListText,
  SHOPPING_CATEGORIES,
  type ShoppingCategory,
  type ShoppingTextItem,
} from '~/lib/shopping-list';

export const MAX_MAILTO_LENGTH = 1_900;

export type ShoppingExportDocument = {
  listName: string;
  /** Every store the list spans, in display order; empty when unspecified. */
  storeNames: string[];
  storeLabel: string;
  locale: string;
  direction: Direction;
  categoryLabels: Readonly<Record<ShoppingCategory, string>>;
  items: ShoppingTextItem[];
  includeChecked: boolean;
};

export type ShoppingExportCapabilities = {
  clipboard: boolean;
  fileDownload: boolean;
  imageDownload: boolean;
  nativeShare: boolean;
  printView: boolean;
};

export type ShoppingExportCapabilitySource = {
  clipboardWrite?: unknown;
  createElement?: unknown;
  createObjectURL?: unknown;
  revokeObjectURL?: unknown;
  canvasToBlob?: unknown;
  nativeShare?: unknown;
  openWindow?: unknown;
};

export type ShoppingExportErrorCode =
  | 'clipboard-unavailable'
  | 'download-unavailable'
  | 'image-unavailable'
  | 'image-too-large'
  | 'popup-blocked';

export class ShoppingExportError extends Error {
  constructor(readonly code: ShoppingExportErrorCode) {
    super(code);
    this.name = 'ShoppingExportError';
  }
}

export function createShoppingExportDocument({
  listName,
  storeNames,
  storeLabel,
  locale,
  categoryLabels,
  items,
  includeChecked,
}: Omit<ShoppingExportDocument, 'direction'>): ShoppingExportDocument {
  const seen = new Set<string>();
  return {
    listName: listName.trim(),
    storeNames: storeNames
      .map((name) => name.trim())
      .filter((name) => {
        if (!name.length || seen.has(name.toLowerCase())) return false;
        seen.add(name.toLowerCase());
        return true;
      }),
    storeLabel,
    locale,
    direction: localeDirection(locale),
    categoryLabels,
    items,
    includeChecked,
  };
}

/**
 * The `Stores: A, B and C` line shared by every export format, or `null` when
 * the list has no stores.
 */
export function shoppingExportStoreLine(
  document: Pick<ShoppingExportDocument, 'storeNames' | 'storeLabel' | 'locale'>,
): string | null {
  if (document.storeNames.length === 0) return null;
  return `${document.storeLabel}: ${formatList(document.storeNames, document.locale)}`;
}

export function visibleShoppingExportItems(document: ShoppingExportDocument): ShoppingTextItem[] {
  return document.items.filter((item) => document.includeChecked || !item.checked);
}

export function groupShoppingExportItems(
  document: ShoppingExportDocument,
): Array<{ category: ShoppingCategory; items: ShoppingTextItem[] }> {
  const visible = visibleShoppingExportItems(document);
  return SHOPPING_CATEGORIES.map((category) => ({
    category,
    items: visible
      .filter((item) => item.category === category)
      .sort((a, b) => a.item.localeCompare(b.item, document.locale)),
  })).filter((group) => group.items.length > 0);
}

export function serializeShoppingExportText(document: ShoppingExportDocument): string {
  return formatShoppingListText(document.items, {
    includeChecked: document.includeChecked,
    title: document.listName,
    subtitle: shoppingExportStoreLine(document) ?? undefined,
    categoryLabels: document.categoryLabels,
    locale: document.locale,
  });
}

export function shoppingExportFilename(
  document: Pick<ShoppingExportDocument, 'listName'>,
  extension: 'png' | 'txt',
): string {
  const base =
    document.listName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'shopping-list';
  return `${base}.${extension}`;
}

export type MailtoResult =
  { ok: true; href: string } | { ok: false; reason: 'too-long'; length: number };

export function buildShoppingListMailto(
  subject: string,
  body: string,
  maxLength = MAX_MAILTO_LENGTH,
): MailtoResult {
  const href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (href.length > maxLength) {
    return { ok: false, reason: 'too-long', length: href.length };
  }
  return { ok: true, href };
}

export function detectShoppingExportCapabilities(
  source?: ShoppingExportCapabilitySource,
): ShoppingExportCapabilities {
  const detected: ShoppingExportCapabilitySource = source ?? {
    clipboardWrite:
      typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function',
    createElement: typeof document !== 'undefined' && typeof document.createElement === 'function',
    createObjectURL: typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function',
    revokeObjectURL: typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function',
    canvasToBlob:
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.toBlob === 'function',
    nativeShare: typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    openWindow: typeof window !== 'undefined' && typeof window.open === 'function',
  };
  const available = (value: unknown) => value === true || typeof value === 'function';
  const hasDocument = available(detected.createElement);
  const hasUrl = available(detected.createObjectURL) && available(detected.revokeObjectURL);
  const hasCanvas = available(detected.canvasToBlob);

  return {
    clipboard: available(detected.clipboardWrite),
    fileDownload: hasDocument && hasUrl,
    imageDownload: hasDocument && hasUrl && hasCanvas,
    nativeShare: available(detected.nativeShare),
    printView: available(detected.openWindow),
  };
}

export async function copyShoppingExportText(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
    throw new ShoppingExportError('clipboard-unavailable');
  }
  await navigator.clipboard.writeText(text);
}

function downloadBlob(blob: Blob, filename: string): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    throw new ShoppingExportError('download-unavailable');
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function downloadShoppingExportText(document: ShoppingExportDocument): void {
  downloadBlob(
    new Blob([`${serializeShoppingExportText(document)}\n`], {
      type: 'text/plain;charset=utf-8',
    }),
    shoppingExportFilename(document, 'txt'),
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}

export function buildShoppingListPrintHtml(
  document: ShoppingExportDocument,
  labels: { print: string; close: string; completed: string },
): string {
  const groups = groupShoppingExportItems(document);
  const storeLine = shoppingExportStoreLine(document);
  const store = storeLine ? `<p class="store">${escapeHtml(storeLine)}</p>` : '';
  const sections = groups
    .map(
      (group) => `<section>
        <h2>${escapeHtml(document.categoryLabels[group.category])}</h2>
        <ul>${group.items
          .map(
            (item) =>
              `<li${item.checked ? ' class="completed"' : ''}><span class="box" aria-hidden="true">${item.checked ? '✓' : ''}</span><span>${escapeHtml(formatShoppingListItemLine(item, document.locale))}${item.checked ? ` <span class="status">(${escapeHtml(labels.completed)})</span>` : ''}</span></li>`,
          )
          .join('')}</ul>
      </section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${escapeHtml(document.locale)}" dir="${document.direction}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(document.listName)}</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fffaf3; color: #292524; }
    .toolbar { align-items: center; background: white; border-block-end: 1px solid #e7e5e4; display: flex; flex-wrap: wrap; gap: .75rem; justify-content: center; padding: 1rem; }
    button { background: #b45309; border: 0; border-radius: .65rem; color: white; cursor: pointer; font: inherit; font-weight: 700; min-height: 2.75rem; padding: .65rem 1rem; }
    button.secondary { background: transparent; border: 1px solid #78716c; color: #292524; }
    main { margin: 2rem auto; max-width: 46rem; padding: 0 1.25rem 3rem; }
    article { background: white; border: 1px solid #e7e5e4; border-radius: 1rem; padding: clamp(1.5rem, 5vw, 3rem); }
    header { border-block-end: 2px solid #b45309; margin-block-end: 1.75rem; padding-block-end: 1rem; }
    .brand { color: #b45309; font-size: .75rem; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    h1 { font-family: Georgia, serif; font-size: 2rem; line-height: 1.15; margin: .35rem 0 0; overflow-wrap: anywhere; }
    .store { color: #57534e; margin: .45rem 0 0; overflow-wrap: anywhere; }
    section { break-inside: avoid; margin-block-start: 1.5rem; }
    h2 { color: #78716c; font-size: .78rem; letter-spacing: .11em; margin: 0 0 .45rem; text-transform: uppercase; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { align-items: baseline; display: flex; gap: .7rem; padding: .35rem 0; }
    .box { border: 1.5px solid #78716c; border-radius: .2rem; display: inline-flex; flex: 0 0 1rem; height: 1rem; justify-content: center; line-height: .8rem; width: 1rem; }
    .completed { color: #78716c; text-decoration: line-through; }
    .status { font-size: .82em; }
    footer { border-block-start: 1px solid #e7e5e4; color: #78716c; font-size: .75rem; margin-block-start: 2rem; padding-block-start: .75rem; text-align: center; }
    @page { margin: .6in; size: A4; }
    @media print {
      body { background: white; }
      .toolbar { display: none; }
      main { margin: 0; max-width: none; padding: 0; }
      article { border: 0; border-radius: 0; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="print-list" type="button">${escapeHtml(labels.print)}</button>
    <button id="close-print-view" type="button" class="secondary">${escapeHtml(labels.close)}</button>
  </div>
  <main><article>
    <header><div class="brand">${brand.name}</div><h1>${escapeHtml(document.listName)}</h1>${store}</header>
    ${sections}
    <footer>${brand.name} · ${escapeHtml(brand.tagline)}</footer>
  </article></main>
</body>
</html>`;
}

export function openShoppingListPrintView(
  document: ShoppingExportDocument,
  labels: { print: string; close: string; completed: string },
): void {
  if (typeof window === 'undefined' || typeof window.open !== 'function') {
    throw new ShoppingExportError('popup-blocked');
  }
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new ShoppingExportError('popup-blocked');
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(buildShoppingListPrintHtml(document, labels));
  printWindow.document.close();
  printWindow.document
    .getElementById('print-list')
    ?.addEventListener('click', () => printWindow.print());
  printWindow.document
    .getElementById('close-print-view')
    ?.addEventListener('click', () => printWindow.close());
  printWindow.focus();
}

type CanvasLine = {
  text: string;
  kind: 'category' | 'item' | 'note';
  checked?: boolean;
};

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      if (context.measureText(word).width <= maxWidth) return [word];
      const chunks: string[] = [];
      let chunk = '';
      for (const character of Array.from(word)) {
        const candidate = `${chunk}${character}`;
        if (chunk && context.measureText(candidate).width > maxWidth) {
          chunks.push(chunk);
          chunk = character;
        } else {
          chunk = candidate;
        }
      }
      if (chunk) chunks.push(chunk);
      return chunks;
    });
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let line = words[0]!;
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new ShoppingExportError('image-unavailable'));
    }, 'image/png');
  });
}

export async function renderShoppingListImage(
  exportDocument: ShoppingExportDocument,
): Promise<Blob> {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof HTMLCanvasElement === 'undefined' ||
    typeof HTMLCanvasElement.prototype.toBlob !== 'function'
  ) {
    throw new ShoppingExportError('image-unavailable');
  }

  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new ShoppingExportError('image-unavailable');

  const width = 1_200;
  const padding = 84;
  const contentWidth = width - padding * 2;
  const textWidth = contentWidth - 48;
  const lines: CanvasLine[] = [];
  context.font = '700 58px Georgia, "Times New Roman", serif';
  const titleLines = wrapCanvasText(context, exportDocument.listName, contentWidth);
  context.font = '500 28px system-ui, -apple-system, "Segoe UI", sans-serif';
  const storeSubtitle = shoppingExportStoreLine(exportDocument);
  const storeLines = storeSubtitle ? wrapCanvasText(context, storeSubtitle, contentWidth) : [];

  for (const group of groupShoppingExportItems(exportDocument)) {
    lines.push({
      text: exportDocument.categoryLabels[group.category],
      kind: 'category',
    });
    context.font = '600 34px system-ui, -apple-system, "Segoe UI", sans-serif';
    for (const item of group.items) {
      const wrapped = wrapCanvasText(
        context,
        formatShoppingListItemLine(item, exportDocument.locale),
        textWidth,
      );
      wrapped.forEach((text, index) =>
        lines.push({
          text,
          kind: index === 0 ? 'item' : 'note',
          checked: item.checked,
        }),
      );
    }
  }

  const headerHeight = 130 + titleLines.length * 68 + storeLines.length * 40 + 48;
  const contentHeight = lines.reduce(
    (height, line) => height + (line.kind === 'category' ? 82 : line.kind === 'item' ? 54 : 44),
    0,
  );
  const height = headerHeight + contentHeight + 140;
  if (height > 30_000) throw new ShoppingExportError('image-too-large');

  canvas.width = width;
  canvas.height = Math.max(720, height);
  const x = exportDocument.direction === 'rtl' ? width - padding : padding;
  context.direction = exportDocument.direction;
  context.textAlign = 'start';
  context.textBaseline = 'top';

  context.fillStyle = '#fffaf3';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#b45309';
  context.fillRect(
    exportDocument.direction === 'rtl' ? canvas.width - 18 : 0,
    0,
    18,
    canvas.height,
  );
  context.fillStyle = '#92400e';
  context.font = '800 24px system-ui, -apple-system, "Segoe UI", sans-serif';
  context.fillText(brand.name.toUpperCase(), x, 68);
  context.fillStyle = '#292524';
  context.font = '700 58px Georgia, "Times New Roman", serif';
  let y = 112;
  for (const line of titleLines) {
    context.fillText(line, x, y);
    y += 68;
  }
  if (storeLines.length > 0) {
    context.fillStyle = '#57534e';
    context.font = '500 28px system-ui, -apple-system, "Segoe UI", sans-serif';
    for (const line of storeLines) {
      context.fillText(line, x, y);
      y += 40;
    }
  }
  context.fillStyle = '#b45309';
  context.fillRect(padding, y, contentWidth, 3);
  y += 42;

  for (const line of lines) {
    if (line.kind === 'category') {
      y += 20;
      context.fillStyle = '#92400e';
      context.font = '800 23px system-ui, -apple-system, "Segoe UI", sans-serif';
      context.fillText(line.text.toUpperCase(), x, y, contentWidth);
      y += 62;
      continue;
    }
    context.fillStyle = line.checked ? '#78716c' : '#292524';
    context.font =
      line.kind === 'item'
        ? '600 34px system-ui, -apple-system, "Segoe UI", sans-serif'
        : '500 30px system-ui, -apple-system, "Segoe UI", sans-serif';
    const textX = exportDocument.direction === 'rtl' ? x - 48 : x + 48;
    if (line.kind === 'item') {
      const boxX = exportDocument.direction === 'rtl' ? x - 30 : x;
      context.strokeStyle = '#78716c';
      context.lineWidth = 3;
      context.strokeRect(boxX, y + 3, 28, 28);
      if (line.checked) {
        context.fillStyle = '#78716c';
        context.save();
        context.direction = 'ltr';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = '700 20px system-ui, -apple-system, "Segoe UI", sans-serif';
        context.fillText('✓', boxX + 14, y + 17);
        context.restore();
      }
    }
    context.fillText(line.text, textX, y, textWidth);
    y += line.kind === 'item' ? 54 : 44;
  }

  context.fillStyle = '#78716c';
  context.font = '500 20px system-ui, -apple-system, "Segoe UI", sans-serif';
  context.fillText(`${brand.name} · ${brand.tagline}`, x, canvas.height - 70);
  return canvasToBlob(canvas);
}

export async function downloadShoppingListImage(
  exportDocument: ShoppingExportDocument,
): Promise<void> {
  const blob = await renderShoppingListImage(exportDocument);
  downloadBlob(blob, shoppingExportFilename(exportDocument, 'png'));
}
