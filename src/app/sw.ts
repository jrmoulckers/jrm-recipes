/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

import { isOfflineFallbackRequest } from "../lib/offline-fallback";
import {
  isRecipeImageRequest,
  RECIPE_IMAGE_CACHE_MAX_AGE_SECONDS,
  RECIPE_IMAGE_CACHE_MAX_ENTRIES,
  RECIPE_IMAGE_CACHE_NAME,
  RECIPE_IMAGE_PLACEHOLDER_URL,
} from "../lib/recipe-image-cache";
import {
  isRecipePageRequest,
  RECIPE_PAGE_CACHE_MAX_AGE_SECONDS,
  RECIPE_PAGE_CACHE_MAX_ENTRIES,
  RECIPE_PAGE_CACHE_NAME,
} from "../lib/recipe-page-cache";

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
 * Runtime cache for recipe *pages*: the recipe detail + Cook Mode documents and
 * their RSC payloads. Prepended to `defaultCache` so recipe navigations use this
 * named, bounded cache instead of Serwist's generic page handling.
 *
 * StaleWhileRevalidate keeps opening a recipe instant and offline-capable once
 * it's been viewed online, while still refreshing it in the background whenever
 * there's a network. `CacheableResponsePlugin` stores only successful (200)
 * responses so we never cache an error/redirect, and `ExpirationPlugin` bounds
 * the cache by entries and age. This is what makes an already-opened recipe
 * survive an offline reload rather than hitting the `/~offline` fallback.
 */
const recipePageCache: RuntimeCaching = {
  matcher: ({ url, request, sameOrigin }) =>
    sameOrigin &&
    isRecipePageRequest({
      url: url.href,
      destination: request.destination,
      rscHeader: request.headers.get("RSC") === "1",
    }),
  handler: new StaleWhileRevalidate({
    cacheName: RECIPE_PAGE_CACHE_NAME,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: RECIPE_PAGE_CACHE_MAX_ENTRIES,
        maxAgeSeconds: RECIPE_PAGE_CACHE_MAX_AGE_SECONDS,
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
  runtimeCaching: [recipeImageCache, recipePageCache, ...defaultCache],
  fallbacks: {
    entries: [
      {
        // Precached in next.config.js via `additionalPrecacheEntries`. Served
        // whenever a navigation can't be fulfilled from network or cache —
        // both hard document loads and soft (RSC) client-side navigations.
        url: "/~offline",
        matcher: ({ request }) => isOfflineFallbackRequest(request),
      },
      {
        // Bundled placeholder for a recipe image that isn't cached and can't be
        // fetched offline. Returned via Serwist's handlerDidError fallback when
        // the recipe-image CacheFirst route misses, so recipe/cook layouts show
        // a tasteful placeholder instead of a broken-image icon. Scoped to
        // recipe images (same predicate as the cache) so other images are left
        // untouched.
        url: RECIPE_IMAGE_PLACEHOLDER_URL,
        matcher: ({ url, request }) =>
          isRecipeImageRequest({
            url: url.href,
            destination: request.destination,
          }),
      },
    ],
  },
});

serwist.addEventListeners();
