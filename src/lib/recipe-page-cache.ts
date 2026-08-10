/**
 * Runtime-cache matcher shared by the service worker for recipe *pages*. The
 * recipe detail document (`/recipes/:id`), the hands-free Cook Mode document
 * (`/recipes/:id/cook`), and the React Server Component payloads that back
 * their soft (client-side) navigations.
 *
 * Kept in its own DOM-typed module rather than inline in `src/app/sw.ts`, which
 * is compiled against the WebWorker lib and excluded from the app tsconfig, so
 * the URL-matching logic stays unit-testable.
 *
 * Once a recipe has been opened online it lands in this cache, so it can be
 * re-opened offline instead of falling back to the generic `/~offline` page.
 */

import { isReservedRecipeSlug } from "./recipe-reserved-slugs";

/** Dedicated cache for recipe page documents + RSC payloads. */
export const RECIPE_PAGE_CACHE_NAME = "heirloom-recipes";

/**
 * Bound the cache so it can't grow without limit. Comfortably holds a good
 * stack of recently viewed recipes (each recipe is at most a couple of entries,
 * the detail + cook documents plus their RSC payloads). Least-recently-used
 * entries are evicted past the limit.
 */
export const RECIPE_PAGE_CACHE_MAX_ENTRIES = 64;

/** ~30 days. NetworkFirst still refreshes entries whenever there's a network. */
export const RECIPE_PAGE_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Sibling routes under `/recipes/*` that are NOT recipe detail pages and must
 * stay on Serwist's default handling (they're list/search/form pages, some with
 * their own query params or auth-gated mutations). Sourced from the shared
 * reserved-slug set so the SW matcher and the write-time slug guard can't drift.
 */

/**
 * The subset of a `Request` the matcher reads. A real `Request` satisfies this,
 * and it keeps the function trivially constructable in tests (a constructed
 * `Request` can't carry a `"document"` destination, since the browser, not the
 * constructor, assigns it).
 */
export interface RecipePageRequest {
  /** Absolute request URL (`url.href` from the Serwist route matcher). */
  url: string;
  /** `RequestDestination`. `"document"` for top-level page navigations. */
  destination: Request["destination"];
  /** Whether the request carries Next.js's `RSC: 1` header (soft navigation). */
  rscHeader: boolean;
}

/** Recipe sub-routes that are never cached as recipe pages. */
const EXCLUDED_SUB_ROUTES = new Set(["edit", "print", "keepsake"]);

/** Whether a same-origin pathname is a recipe detail or cook-mode page. */
function isRecipePagePath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "recipes") return false;

  // Canonical recipe URLs are `/recipes/<cook>/<slug>` with an optional `/cook`
  // sub-route (#666), and the pre-namespacing flat `/recipes/<slug>` shape still
  // resolves, so depths 2 through 4 all reach a recipe document.
  if (segments.length < 2 || segments.length > 4) return false;

  const first = segments[1];
  if (!first || isReservedRecipeSlug(first)) return false;

  // Only the detail document itself, or its Cook Mode sub-route. The editor and
  // the print/keepsake views are deliberately excluded.
  const tail = segments[segments.length - 1]!;
  if (segments.length === 4) return tail === "cook";
  if (segments.length === 3) return !EXCLUDED_SUB_ROUTES.has(tail);

  return true;
}

/**
 * Whether a request should be served from the durable recipe-page cache.
 *
 * Matches two shapes for the recipe detail + cook routes:
 * - **Document navigations** (`destination === "document"`). A hard load or
 *   reload of the page. These are what let an already-opened recipe survive an
 *   offline reload.
 * - **RSC payload requests**. Next.js soft navigations fetch the route's
 *   Server Component payload with an `RSC: 1` header and a cache-busting
 *   `?_rsc=` query param. Caching these lets client-side navigation to a
 *   previously visited recipe work offline too.
 *
 * Non-recipe routes, `/edit`, and other subresources are left to Serwist's
 * `defaultCache`.
 */
export function isRecipePageRequest(request: RecipePageRequest): boolean {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }

  const isRsc = request.rscHeader || url.searchParams.has("_rsc");
  if (request.destination !== "document" && !isRsc) {
    return false;
  }

  return isRecipePagePath(url.pathname);
}
