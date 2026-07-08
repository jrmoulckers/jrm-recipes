import { brand } from "~/config/brand";
import { absoluteUrl } from "~/lib/utils";

/**
 * oEmbed provider helpers (issue #347). Pure + dependency-light so they unit
 * test without a DB or a request: the route layer resolves the recipe and calls
 * {@link buildRecipeOembed}. Everything here is safe to run on the edge.
 */

/** Default iframe dimensions for an embedded recipe card. */
export const OEMBED_DEFAULT_WIDTH = 500;
export const OEMBED_DEFAULT_HEIGHT = 320;
/** Never advertise an iframe smaller than this (keeps the card legible). */
export const OEMBED_MIN_WIDTH = 280;
export const OEMBED_MIN_HEIGHT = 200;

/** A minimal oEmbed `rich` response (https://oembed.com/#section2.3.4). */
export type OembedRich = {
  version: "1.0";
  type: "rich";
  provider_name: string;
  provider_url: string;
  title: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  cache_age: number;
  width: number;
  height: number;
  html: string;
};

/** The public recipe fields the oEmbed payload is built from. */
export type OembedRecipe = {
  slug: string;
  title: string;
  coverImageUrl: string | null;
  author: { name: string | null; handle: string | null } | null;
};

/**
 * Extract a recipe slug/id from a canonical recipe URL, but only when it points
 * at *this* app's `/recipes/{slug}` path. Foreign origins, other paths, and
 * malformed input all return `null` so the endpoint can't be pointed at
 * arbitrary URLs (SSRF/abuse guard). `baseUrl` defaults to the app's own origin.
 */
export function recipeSlugFromUrl(
  rawUrl: string,
  baseUrl: string = absoluteUrl("/"),
): string | null {
  let url: URL;
  let base: URL;
  try {
    url = new URL(rawUrl);
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  if (url.host !== base.host) return null;
  const match = /^\/recipes\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]!).trim();
  return slug.length > 0 ? slug : null;
}

/** Clamp a requested dimension into `[min, fallback]` (oEmbed maxwidth/height). */
export function clampDimension(
  requested: number | null,
  fallback: number,
  min: number,
): number {
  if (requested == null || !Number.isFinite(requested)) return fallback;
  return Math.max(min, Math.min(Math.floor(requested), fallback));
}

/**
 * Build the oEmbed `rich` payload for a public recipe. The `html` is a
 * self-contained, sandbox-friendly iframe pointing at the public
 * `/embed/recipes/{slug}` card, so every embed carries our brand + a link back.
 */
export function buildRecipeOembed(
  recipe: OembedRecipe,
  opts: { maxwidth?: number | null; maxheight?: number | null } = {},
): OembedRich {
  const width = clampDimension(
    opts.maxwidth ?? null,
    OEMBED_DEFAULT_WIDTH,
    OEMBED_MIN_WIDTH,
  );
  const height = clampDimension(
    opts.maxheight ?? null,
    OEMBED_DEFAULT_HEIGHT,
    OEMBED_MIN_HEIGHT,
  );
  const src = absoluteUrl(`/embed/recipes/${recipe.slug}`);
  const html =
    `<iframe src="${src}" width="${width}" height="${height}" ` +
    `style="border:0;border-radius:16px;max-width:100%;" ` +
    `frameborder="0" scrolling="no" loading="lazy" ` +
    `title="${escapeHtmlAttr(recipe.title)} on ${brand.name}" ` +
    `allow="clipboard-write"></iframe>`;

  const authorHandle = recipe.author?.handle ?? null;
  return {
    version: "1.0",
    type: "rich",
    provider_name: brand.name,
    provider_url: absoluteUrl("/"),
    title: recipe.title,
    ...(recipe.author?.name ? { author_name: recipe.author.name } : {}),
    ...(authorHandle
      ? { author_url: absoluteUrl(`/cooks/${authorHandle}`) }
      : {}),
    ...(recipe.coverImageUrl ? { thumbnail_url: recipe.coverImageUrl } : {}),
    cache_age: 3600,
    width,
    height,
    html,
  };
}

/** Escape the few characters that would break a double-quoted HTML attribute. */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
