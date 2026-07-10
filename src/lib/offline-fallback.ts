/**
 * Predicate shared by the service worker's offline fallback.
 *
 * Kept in its own DOM-typed module — rather than inline in `src/app/sw.ts`,
 * which is compiled against the WebWorker lib and excluded from the app
 * tsconfig — so the navigation-detection logic stays unit-testable.
 */

/**
 * The subset of a `Request` the fallback predicate reads. A real `Request`
 * satisfies this, and it keeps the function trivially constructable in tests
 * (a constructed `Request` can't carry a `"document"` destination, since the
 * browser — not the constructor — assigns it).
 */
export interface OfflineFallbackRequest {
  /** `RequestDestination`; `"document"` for hard navigations and reloads. */
  destination: Request["destination"];
  /** Request headers; App Router RSC navigations carry `RSC: 1`. */
  headers: Pick<Headers, "get">;
}

/**
 * Whether a request that failed offline (network miss, nothing cached) should
 * fall back to the precached `/~offline` page.
 *
 * Two navigation shapes need to reach the fallback:
 *
 * - **Hard navigations and reloads**, where the browser requests an HTML
 *   document (`request.destination === "document"`).
 * - **Soft, client-side App Router navigations**, which don't request a
 *   document — they fetch an RSC payload, flagged with the `RSC: 1` header
 *   (both viewport prefetches and click-time navigations). Offline with no
 *   cached copy these fetches fail; returning the offline document makes the
 *   Next.js router fall back to a hard navigation that lands on `/~offline`,
 *   instead of the click silently dying.
 */
export function isOfflineFallbackRequest(
  request: OfflineFallbackRequest,
): boolean {
  if (request.destination === "document") {
    return true;
  }
  return request.headers.get("RSC") === "1";
}
