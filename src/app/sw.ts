/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

import { isOfflineFallbackRequest } from "../lib/offline-fallback";

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
  runtimeCaching: defaultCache,
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
