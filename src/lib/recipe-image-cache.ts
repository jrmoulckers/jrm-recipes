/**
 * Runtime-cache matcher shared by the service worker for Cloudinary-backed
 * recipe / cook-mode images.
 *
 * Kept in its own DOM-typed module — rather than inline in `src/app/sw.ts`,
 * which is compiled against the WebWorker lib and excluded from the app
 * tsconfig — so the URL-matching logic stays unit-testable.
 */

/** Cloudinary host that serves every recipe + step image (see next.config.js). */
export const CLOUDINARY_IMAGE_HOSTNAME = "res.cloudinary.com";

/** Dedicated cache for recipe images, separate from Serwist's defaults. */
export const RECIPE_IMAGE_CACHE_NAME = "heirloom-recipe-images";

/**
 * Bound the cache so it can't grow without limit. A single `next/image` render
 * emits several `srcset` widths, so this comfortably holds a handful of fully
 * viewed recipes while capping disk use; least-recently-used entries are
 * evicted past the limit.
 */
export const RECIPE_IMAGE_CACHE_MAX_ENTRIES = 128;

/** ~30 days. Recipe photos are effectively immutable once uploaded. */
export const RECIPE_IMAGE_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Bundled, precached placeholder returned when a recipe image can't be fetched
 * offline and isn't in the cache. Keeps layouts from collapsing into a
 * broken-image icon (see the `fallbacks` config + `catch` handling in
 * `src/app/sw.ts`). A tiny inline SVG, so it costs almost nothing to precache.
 */
export const RECIPE_IMAGE_PLACEHOLDER_URL = "/img/recipe-image-placeholder.svg";

/**
 * The subset of a `Request` the matcher reads. A real `Request` satisfies this,
 * and it keeps the function trivially constructable in tests (a constructed
 * `Request` can't carry an `"image"` destination, since the browser — not the
 * constructor — assigns it).
 */
export interface RecipeImageRequest {
  /** Absolute request URL (`url.href` from the Serwist route matcher). */
  url: string;
  /** `RequestDestination`; `"image"` for `<img>` / `next/image` requests. */
  destination: Request["destination"];
}

/** Whether `hostname` is exactly the Cloudinary image host (no subdomain spoofing). */
function isCloudinaryHost(hostname: string): boolean {
  return hostname === CLOUDINARY_IMAGE_HOSTNAME;
}

/**
 * Whether a request should be served from the durable recipe-image cache.
 *
 * Cook Mode renders step/hero photos with `next/image`, so the browser doesn't
 * request Cloudinary directly — it hits the Next.js optimizer at
 * `/_next/image?url=<encoded cloudinary url>&w=…&q=…` (same-origin). Both shapes
 * therefore need to match:
 *
 * - **Optimizer requests** whose decoded `url` param points at Cloudinary. This
 *   also leaves non-recipe optimized images (e.g. Clerk avatars) on Serwist's
 *   default `next-image` route.
 * - **Direct Cloudinary requests**, for any image rendered without the optimizer.
 *
 * Restricted to `destination === "image"` so Cloudinary *videos* — which are
 * large and stream via range requests — never land in this bounded cache.
 */
export function isRecipeImageRequest(request: RecipeImageRequest): boolean {
  if (request.destination !== "image") {
    return false;
  }

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }

  if (isCloudinaryHost(url.hostname)) {
    return true;
  }

  if (url.pathname === "/_next/image") {
    const proxied = url.searchParams.get("url");
    if (proxied) {
      try {
        return isCloudinaryHost(new URL(proxied, url.origin).hostname);
      } catch {
        return false;
      }
    }
  }

  return false;
}
