/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  Serwist,
} from "serwist";

import { isOfflineFallbackRequest } from "../lib/offline-fallback";
import {
  isRecipeImageRequest,
  RECIPE_IMAGE_CACHE_MAX_AGE_SECONDS,
  RECIPE_IMAGE_CACHE_MAX_ENTRIES,
  RECIPE_IMAGE_CACHE_NAME,
} from "../lib/recipe-image-cache";

/**
 * Durable, offline-first cache for Cloudinary-backed recipe / cook-mode images.
 *
 * Prepended to `defaultCache` so it wins for recipe images: Serwist matches
 * runtime routes in order and Serwist's own `next-image` route only keeps them
 * StaleWhileRevalidate for a day, which doesn't guarantee they survive offline
 * or load instantly on repeat visits. CacheFirst serves straight from the cache
 * once stored (photos are effectively immutable); `CacheableResponsePlugin`
 * permits opaque (status 0) cross-origin Cloudinary responses, and
 * `ExpirationPlugin` keeps the cache bounded by entries and age.
 */
const recipeImageCache: RuntimeCaching = {
  matcher: ({ url, request }) =>
    isRecipeImageRequest({ url: url.href, destination: request.destination }),
  handler: new CacheFirst({
    cacheName: RECIPE_IMAGE_CACHE_NAME,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: RECIPE_IMAGE_CACHE_MAX_ENTRIES,
        maxAgeSeconds: RECIPE_IMAGE_CACHE_MAX_AGE_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  }),
};

/**
 * Heirloom service worker (Serwist). Precaches the app shell and applies
 * sensible runtime caching so cook mode keeps working offline in the kitchen.
 *
 * Excluded from the app tsconfig (compiled by Serwist's webpack loader) so the
 * WebWorker lib types here don't collide with the DOM lib used app-wide.
 */
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [recipeImageCache, ...defaultCache],
  fallbacks: {
    entries: [
      {
        // Precached in next.config.js via `additionalPrecacheEntries`. Served
        // whenever a navigation can't be fulfilled from network or cache —
        // both hard document loads and soft (RSC) client-side navigations.
        url: "/~offline",
        matcher: ({ request }) => isOfflineFallbackRequest(request),
      },
    ],
  },
});

serwist.addEventListeners();
