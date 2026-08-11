import { expect, type Page } from '@playwright/test';

/**
 * A public, published recipe from the seed (`src/server/db/seed.ts`), owned by
 * the local dev user. The e2e CI job seeds Postgres so it has content.
 */
export const SEEDED_RECIPE_SLUG = 'nonnas-sunday-gravy';

/**
 * The flat pre-namespacing URL.
 *
 * It does **not** redirect: it renders the not-found page (#849). Kept only so
 * `not-found.spec.ts` and any future redirect work have a name for it — never
 * navigate to it expecting the recipe.
 */
export const SEEDED_RECIPE_FLAT_PATH = `/recipes/${SEEDED_RECIPE_SLUG}`;

/**
 * Navigate to the seeded recipe and return its canonical path.
 *
 * Resolution goes through `/sitemap.xml` rather than a constructed URL: recipes
 * live at `/recipes/<cook>/<slug>`, so building the path here would couple every
 * spec to the seed's user slug. The sitemap is the app's own statement of which
 * path is canonical (ADR 0003 lists the owner path and omits creator mirrors),
 * and unlike the `/recipes` index it is unpaginated — so it stays correct as
 * specs add recipes of their own.
 *
 * **The HTTP status cannot be used to detect failure.** Every unresolvable
 * `(main)` URL answers 200 (#775), so a status check accepts the not-found page
 * as a success — which is how #843's four skips came to blame an absent
 * database that was in fact seeded (#849). Resolution is therefore confirmed by
 * the recipe heading actually being on the page.
 *
 * Returns `null` only when the seeded recipe is genuinely absent, so callers can
 * skip rather than fail.
 */
export async function gotoSeededRecipe(page: Page): Promise<string | null> {
  const sitemap = await page.request.get('/sitemap.xml');
  if (!sitemap.ok()) return null;

  const locs = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  const match = locs.find((loc) => new URL(loc).pathname.endsWith(`/${SEEDED_RECIPE_SLUG}`));
  if (match === undefined) return null;

  await page.goto(new URL(match).pathname);

  // The status is not an oracle (#775), so confirm the recipe actually rendered
  // rather than the not-found page that answers 200 in its place.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  return new URL(page.url()).pathname;
}
