/**
 * Runtime-cache matcher shared by the service worker for recipe *pages* — the
 * recipe detail document (`/recipes/:id`), the hands-free Cook Mode document
 * (`/recipes/:id/cook`), and the React Server Component payloads that back
 * their soft (client-side) navigations.
 *
 * Kept in its own DOM-typed module — rather than inline in `src/app/sw.ts`,
 * which is compiled against the WebWorker lib and excluded from the app
 * tsconfig — so the URL-matching logic stays unit-testable.
 *
 * Once a recipe has been opened online it lands in this cache, so it can be
 * re-opened offline instead of falling back to the generic `/~offline` page.
 */

/** Dedicated cache for recipe page documents + RSC payloads. */
export const RECIPE_PAGE_CACHE_NAME = "heirloom-recipes";

/**
 * Bound the cache so it can't grow without limit. Comfortably holds a good
 * stack of recently viewed recipes (each recipe is at most a couple of entries
 * — the detail + cook documents plus their RSC payloads); least-recently-used
 * entries are evicted past the limit.
 */
export const RECIPE_PAGE_CACHE_MAX_ENTRIES = 64;

/** ~30 days. NetworkFirst still refreshes entries whenever there's a network. */
export const RECIPE_PAGE_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Sibling routes under `/recipes/*` that are NOT recipe detail pages and must
 * stay on Serwist's default handling (they're list/search/form pages, some with
 * their own query params or auth-gated mutations).
 */
const RESERVED_RECIPE_SEGMENTS = new Set(["new", "cook-with", "tags"]);

/**
 * The subset of a `Request` the matcher reads. A real `Request` satisfies this,
 * and it keeps the function trivially constructable in tests (a constructed
 * `Request` can't carry a `"document"` destination, since the browser — not the
 * constructor — assigns it).
 */
export interface RecipePageRequest {
  /** Absolute request URL (`url.href` from the Serwist route matcher). */
  url: string;
  /** `RequestDestination`; `"document"` for top-level page navigations. */
  destination: Request["destination"];
  /** Whether the request carries Next.js's `RSC: 1` header (soft navigation). */
  rscHeader: boolean;
}

/** Whether a same-origin pathname is a recipe detail or cook-mode page. */
function isRecipePagePath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  // Expect ["recipes", "<id>"] or ["recipes", "<id>", "cook"].
  if (segments[0] !== "recipes") return false;
  if (segments.length !== 2 && segments.length !== 3) return false;

  const id = segments[1];
  if (!id || RESERVED_RECIPE_SEGMENTS.has(id)) return false;

  // Only the detail document itself, or its Cook Mode sub-route. Anything else
  // under the id (e.g. `/edit`) is deliberately excluded.
  if (segments.length === 3 && segments[2] !== "cook") return false;

  return true;
}

/**
 * Whether a request should be served from the durable recipe-page cache.
 *
 * Matches two shapes for the recipe detail + cook routes:
 * - **Document navigations** (`destination === "document"`) — a hard load or
 *   reload of the page. These are what let an already-opened recipe survive an
 *   offline reload.
 * - **RSC payload requests** — Next.js soft navigations fetch the route's
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
