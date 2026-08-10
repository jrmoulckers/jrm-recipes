import { z } from "zod";

/**
 * Shared, validated contract for App Router `params` / `searchParams` (#208).
 *
 * Next.js hands async pages their route inputs as promises: dynamic segments as
 * `Promise<Params>` and the query string as `Promise<SearchParams>`. Historically
 * each page re-declared those shapes inline (`Promise<{ id: string }>`,
 * `Promise<Record<string, string | string[] | undefined>>`) and normalized the
 * query by hand. This module is the single source of truth for those shapes plus
 * small Zod parsers, so every page consumes the same typed, boundary-validated
 * contract.
 *
 * Dependency-light and free of `server-only` so it can be imported by pages, the
 * search parser, and client helpers alike.
 */

/**
 * Raw Next.js `searchParams`: each key may be absent, a single value, or
 * repeated (`?tag=a&tag=b`). Async pages receive it as a `Promise<SearchParams>`.
 */
export type SearchParams = Record<string, string | string[] | undefined>;

/** Collapse a possibly-repeated query value to its first entry (or undefined). */
export function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Dynamic segments for a canonical recipe route: `/recipes/<cook>/<recipe>`.
 *
 * `cook` is the author's user slug (live or a retained alias) and `recipe` is a
 * slug inside that namespace, a retained alias, or a recipe id. The resolver
 * (`~/server/recipes/resolve`) accepts all of those, so neither is narrowed
 * further here (#666).
 */
export type RecipeRouteParams = { cook: string; recipe: string };
/**
 * Single dynamic segment for the legacy flat recipe route, `/recipes/<x>`. The
 * value is a pre-namespacing global slug or a recipe id; the route resolves it
 * and 308s to the canonical namespaced URL.
 */
export type FlatRecipeRouteParams = { cook: string };
/** Dynamic segment for a saved collection, keyed by id. */
export type CollectionRouteParams = { id: string };
/**
 * Dynamic segment for the public embed card, keyed by recipe **id**. The embed
 * iframe src is built from the id rather than the slug because slugs are only
 * unique inside a cook's namespace (#666).
 */
export type EmbedRecipeRouteParams = { id: string };
/** Dynamic segment for a group route, keyed by its human slug. */
export type SlugRouteParams = { slug: string };
/** Dynamic segment for a public cook profile, keyed by handle. */
export type HandleRouteParams = { handle: string };
/** Dynamic segment for an invite-accept route, keyed by opaque token. */
export type TokenRouteParams = { token: string };

const segment = z.string().min(1);
const recipeParamsSchema = z.object({ cook: segment, recipe: segment });
const flatRecipeParamsSchema = z.object({ cook: segment });
const collectionParamsSchema = z.object({ id: segment });
const slugParamsSchema = z.object({ slug: segment });
const handleParamsSchema = z.object({ handle: segment });
const tokenParamsSchema = z.object({ token: segment });

/** Await + validate a recipe route's `{ cook, recipe }` segments. */
export async function parseRecipeParams(
  params: Promise<RecipeRouteParams>,
): Promise<RecipeRouteParams> {
  return recipeParamsSchema.parse(await params);
}

/** Await + validate the legacy flat recipe route's single `{ cook }` segment. */
export async function parseFlatRecipeParams(
  params: Promise<FlatRecipeRouteParams>,
): Promise<FlatRecipeRouteParams> {
  return flatRecipeParamsSchema.parse(await params);
}

/** Await + validate the embed card's `{ id }` segment. */
export async function parseEmbedRecipeParams(
  params: Promise<EmbedRecipeRouteParams>,
): Promise<EmbedRecipeRouteParams> {
  return collectionParamsSchema.parse(await params);
}

/** Await + validate a collection route's `{ id }` segment. */
export async function parseCollectionParams(
  params: Promise<CollectionRouteParams>,
): Promise<CollectionRouteParams> {
  return collectionParamsSchema.parse(await params);
}

/** Await + validate a group route's `{ slug }` segment. */
export async function parseSlugParams(
  params: Promise<SlugRouteParams>,
): Promise<SlugRouteParams> {
  return slugParamsSchema.parse(await params);
}

/** Await + validate a cook-profile route's `{ handle }` segment. */
export async function parseHandleParams(
  params: Promise<HandleRouteParams>,
): Promise<HandleRouteParams> {
  return handleParamsSchema.parse(await params);
}

/** Await + validate an invite route's `{ token }` segment. */
export async function parseTokenParams(
  params: Promise<TokenRouteParams>,
): Promise<TokenRouteParams> {
  return tokenParamsSchema.parse(await params);
}
