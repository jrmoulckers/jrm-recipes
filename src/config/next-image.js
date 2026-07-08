// @ts-check

import { ALLOWED_MEDIA_HOSTS } from "./media-hosts.js";

/**
 * next/image optimizer settings.
 *
 * Extracted from `next.config.js` so the perf-critical values (AVIF, cache TTL,
 * and the size ladder tuned to the app's real layout `sizes`) can be
 * unit-tested independently of the side-effectful config entrypoint.
 *
 * @type {NonNullable<import("next").NextConfig["images"]>}
 */
export const imageConfig = {
  // Serve AVIF first (≈20-30% smaller than WebP for photos), then WebP, then the
  // browser's own fallback. Ordered by preference.
  formats: ["image/avif", "image/webp"],
  // Optimized variants are effectively immutable, so cache them at the
  // edge/browser for ~31 days instead of re-optimizing on near-every request.
  minimumCacheTTL: 2_678_400,
  // Tuned to the app's real layout `sizes`: full-bleed heroes (100vw) and the
  // 2-3 column grids (50vw/33vw) top out at the max container width. The default
  // 2048/3840 rungs are never requested, so dropping them avoids generating
  // oversized variants (esp. on high-DPR phones, which cap around 1290px).
  deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  // Fixed-width images (step photos ~28rem, card thumbnails, avatars) live at
  // the small end of the ladder — all below the smallest deviceSize.
  imageSizes: [48, 64, 96, 128, 256, 384],
  // Derived from the single media-host allowlist (issue #216) so the optimizer
  // only ever fetches hosts we also permit recipes to store.
  remotePatterns: ALLOWED_MEDIA_HOSTS.map((hostname) => ({ hostname })),
};
