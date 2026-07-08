/**
 * Contract + helpers for proactively warming the offline Cook Mode bundle
 * (issue #166). Kept free of any `next/*` or DOM imports so it's safe to import
 * from BOTH the service worker (`src/app/sw.ts`, WebWorker lib) and the client
 * warmer, and stays trivially unit-testable.
 *
 * The client posts a {@link WarmCookBundleMessage} to the active service
 * worker, which precaches the listed URLs into the EXISTING named caches
 * (`heirloom-recipes` for the Cook document, `heirloom-recipe-images` for step
 * images) — so a cook can open a recipe, drop offline, and still enter Cook
 * Mode fully.
 */

/** postMessage discriminator for a Cook-bundle warm request. */
export const WARM_COOK_BUNDLE_MESSAGE_TYPE = "heirloom:warm-cook-bundle";

export interface WarmCookBundleMessage {
  type: typeof WARM_COOK_BUNDLE_MESSAGE_TYPE;
  /** Cook route document URL(s) → warmed into the recipe-pages cache. */
  pageUrls: string[];
  /** Exact image delivery URLs Cook Mode will request → recipe-images cache. */
  imageUrls: string[];
}

/** Path Cook Mode is served from for a given recipe id/slug. */
export function cookPagePath(slug: string): string {
  return `/recipes/${slug}/cook`;
}

/**
 * The app's real device-size ladder (kept in sync with
 * `src/config/next-image.js`). next/image builds an image's `srcset` from these
 * widths — even with the Cloudinary loader — so the browser always requests one
 * of these exact rungs.
 */
const DEVICE_SIZES: readonly number[] = [640, 750, 828, 1080, 1200, 1920];
const LARGEST_DEVICE_SIZE = 1920;

/**
 * The device-size rung(s) Cook Mode will actually request for a full-bleed
 * (`100vw`) image on THIS device. next/image picks the smallest rung
 * `>= cssWidth * DPR`; we warm that rung plus the next one up, so the warmed URL
 * still matches after a rotation or minor DPR rounding. Clamped so a hostile /
 * absurd viewport can't explode the list.
 */
export function cookImageWidths(viewportWidth: number, dpr: number): number[] {
  const safeDpr = Math.min(Math.max(Number.isFinite(dpr) ? dpr : 1, 1), 3);
  const safeWidth = Math.max(Number.isFinite(viewportWidth) ? viewportWidth : 0, 1);
  const target = Math.ceil(safeWidth * safeDpr);

  const chosen = DEVICE_SIZES.find((width) => width >= target) ?? LARGEST_DEVICE_SIZE;
  const nextUp = DEVICE_SIZES[DEVICE_SIZES.indexOf(chosen) + 1] ?? chosen;

  return [...new Set<number>([chosen, nextUp])];
}

/**
 * Build the exact image delivery URLs to warm for Cook Mode. `transform` is the
 * same width→URL mapping the UI uses (the Cloudinary loader) — injected so this
 * module stays free of `next/*` imports. Blank sources are skipped; results are
 * de-duplicated.
 */
export function cookImageUrlsToWarm(
  imageSrcs: (string | null | undefined)[],
  viewportWidth: number,
  dpr: number,
  transform: (src: string, width: number) => string,
): string[] {
  const widths = cookImageWidths(viewportWidth, dpr);
  const urls = new Set<string>();
  for (const src of imageSrcs) {
    if (!src?.trim()) continue;
    for (const width of widths) {
      urls.add(transform(src, width));
    }
  }
  return [...urls];
}

/** Build the warm message for a recipe's Cook bundle. */
export function buildWarmCookBundleMessage(input: {
  slug: string;
  imageUrls: string[];
}): WarmCookBundleMessage {
  return {
    type: WARM_COOK_BUNDLE_MESSAGE_TYPE,
    pageUrls: [cookPagePath(input.slug)],
    imageUrls: input.imageUrls,
  };
}

/** Narrow an arbitrary `postMessage` payload to a Cook-bundle warm request. */
export function isWarmCookBundleMessage(
  data: unknown,
): data is WarmCookBundleMessage {
  if (typeof data !== "object" || data === null) return false;
  const message = data as Record<string, unknown>;
  return (
    message.type === WARM_COOK_BUNDLE_MESSAGE_TYPE &&
    Array.isArray(message.pageUrls) &&
    Array.isArray(message.imageUrls)
  );
}
