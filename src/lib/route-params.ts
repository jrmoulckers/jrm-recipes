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
 * Dynamic segment for a recipe route. The value may be a recipe **id or slug** —
 * the loader resolves either — so it is deliberately not narrowed further here.
 */
export type RecipeRouteParams = { id: string };
/** Dynamic segment for a saved collection, keyed by id. */
export type CollectionRouteParams = { id: string };
/** Dynamic segment for a group route, keyed by its human slug. */
export type SlugRouteParams = { slug: string };
/** Dynamic segment for a public cook profile, keyed by handle. */
export type HandleRouteParams = { handle: string };
/** Dynamic segment for an invite-accept route, keyed by opaque token. */
export type TokenRouteParams = { token: string };

const segment = z.string().min(1);
const recipeParamsSchema = z.object({ id: segment });
const collectionParamsSchema = z.object({ id: segment });
const slugParamsSchema = z.object({ slug: segment });
const handleParamsSchema = z.object({ handle: segment });
const tokenParamsSchema = z.object({ token: segment });

/** Await + validate a recipe route's `{ id }` (id or slug) segment. */
export async function parseRecipeParams(
  params: Promise<RecipeRouteParams>,
): Promise<RecipeRouteParams> {
  return recipeParamsSchema.parse(await params);
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
