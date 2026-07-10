/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
} from "serwist";

import { isOfflineFallbackRequest } from "../lib/offline-fallback";
import { COOK_NOTIFICATION_TYPE, matchesCookClient } from "../lib/cook-notify";
import {
  isWarmCookBundleMessage,
  type WarmCookBundleMessage,
} from "../lib/cook-warm";
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
 * NetworkFirst (deliberately NOT StaleWhileRevalidate): these pages are
 * server-rendered PER VIEWER and access-controlled — `getRecipe()` returns a 404
 * for a viewer who can't see a private/group recipe, and the HTML embeds
 * personalized favorite/rating/cook-log state plus owner-only controls. This
 * cache is keyed only by URL (the auth cookie is not in `Vary`), so serving it
 * ahead of the network would, on a shared browser profile (a family kitchen
 * tablet — exactly this app's threat model), show one user another user's
 * authorized private page, and even the same user would see stale personalized
 * state while online. NetworkFirst always fetches fresh, correctly-authorized
 * content whenever there's a network and only falls back to the cache when
 * offline (or after `networkTimeoutSeconds` on a stalled connection) — which is
 * all that #157's "reopen an already-opened recipe offline" needs.
 * `CacheableResponsePlugin` stores only successful (200) responses so we never
 * cache an error/redirect, and `ExpirationPlugin` bounds the cache.
 */
const recipePageCache: RuntimeCaching = {
  matcher: ({ url, request, sameOrigin }) =>
    sameOrigin &&
    isRecipePageRequest({
      url: url.href,
      destination: request.destination,
      rscHeader: request.headers.get("RSC") === "1",
    }),
  handler: new NetworkFirst({
    cacheName: RECIPE_PAGE_CACHE_NAME,
    // Prefer a fresh, correctly-authorized render, but don't hang a slow
    // connection forever — fall back to the cached copy after a short timeout.
    networkTimeoutSeconds: 3,
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
  // Do NOT auto-activate a new SW: let it enter `waiting` so the client can
  // offer a user-controlled "update available" prompt (issue #163) instead of
  // swapping precached chunks mid-recipe. With `skipWaiting: false` Serwist
  // registers a `message` listener that calls `self.skipWaiting()` when it
  // receives `{ type: "SKIP_WAITING" }` — which the prompt posts on accept.
  skipWaiting: false,
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

/**
 * Global offline fallback for navigations that Serwist's per-route
 * `fallbacks` plugin doesn't cover.
 *
 * Serwist only attaches its precache-fallback plugin to a runtime route whose
 * handler is an `instanceof` *its own* `Strategy` class. The routes provided by
 * `@serwist/next`'s `defaultCache` — including the catch-all `others`
 * navigation route — are constructed from a separate installed copy of
 * `serwist` (a duplicate pulled in through a differing `browserslist` peer), so
 * that `instanceof` check fails and the `/~offline` fallback never attaches to
 * them. As a result a hard navigation to a route that was never visited online
 * would fail outright offline instead of showing the offline page.
 *
 * A global catch handler runs whenever a matched route's handler rejects
 * (network miss + cache miss) regardless of which `serwist` copy owns the
 * route, so it reliably serves the precached `/~offline` document for both hard
 * and soft (RSC) navigations. Non-navigation failures fall through to a normal
 * network error, preserving existing behavior.
 */
serwist.setCatchHandler(async ({ request }) => {
  if (isOfflineFallbackRequest(request)) {
    const offlineResponse = await serwist.matchPrecache("/~offline");
    if (offlineResponse) return offlineResponse;
  }
  return Response.error();
});

serwist.addEventListeners();

/**
 * Proactively warm the offline Cook Mode bundle on request from the client
 * (see `CookBundleWarmer`, issue #166). Best-effort: each entry is added
 * independently and failures (offline, cross-origin, already-evicted) are
 * swallowed so warming never surfaces an error. Reuses the existing named
 * caches — the Cook document lands in the recipe-pages cache and step images in
 * the recipe-images cache — so there are no duplicate caches.
 */
async function warmCookBundle(message: WarmCookBundleMessage): Promise<void> {
  const warm = async (cacheName: string, urls: string[]): Promise<void> => {
    if (urls.length === 0) return;
    const cache = await caches.open(cacheName);
    await Promise.allSettled(urls.map((url) => cache.add(url)));
  };

  await Promise.allSettled([
    warm(RECIPE_PAGE_CACHE_NAME, message.pageUrls),
    warm(RECIPE_IMAGE_CACHE_NAME, message.imageUrls),
  ]);
}

self.addEventListener("message", (event) => {
  if (isWarmCookBundleMessage(event.data)) {
    event.waitUntil(warmCookBundle(event.data));
  }
});

/**
 * Focus an already-open Cook Mode tab for the tapped timer notification, or open
 * a fresh one (#186). Matches existing windows by pathname so tapping the alert
 * returns the cook straight to the recipe they were cooking.
 */
async function focusOrOpenCook(targetUrl: string): Promise<void> {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clientList) {
    if (matchesCookClient(client.url, targetUrl)) {
      await client.focus();
      return;
    }
  }
  await self.clients.openWindow(targetUrl);
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data as
    { url?: string; type?: string } | undefined;
  // Only handle our cook-timer notifications; leave any others to default.
  if (data?.type !== COOK_NOTIFICATION_TYPE) return;
  event.notification.close();
  const targetUrl = new URL(data.url ?? "/", self.location.origin).href;
  event.waitUntil(focusOrOpenCook(targetUrl));
});
