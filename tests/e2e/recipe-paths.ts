import { type Page } from "@playwright/test";

/**
 * A public, published recipe from the seed (`src/server/db/seed.ts`), owned by
 * the local dev user. The e2e CI job seeds Postgres so it has content.
 */
export const SEEDED_RECIPE_SLUG = "nonnas-sunday-gravy";

/** The flat pre-namespacing URL, which now 308s to the canonical one (#666). */
export const SEEDED_RECIPE_FLAT_PATH = `/recipes/${SEEDED_RECIPE_SLUG}`;

/**
 * Navigate to the seeded recipe and return the path it actually settled on.
 *
 * Recipes live at `/recipes/<cook>/<slug>`, so hard-coding a detail path in a
 * spec would couple it to the seed's user slug. Starting from the flat legacy
 * URL and reading the settled path instead exercises the permanent redirect on
 * every run and yields the canonical base that sub-routes hang off.
 *
 * Returns `null` when the route did not resolve — i.e. no seeded database — so
 * callers can skip rather than fail.
 */
export async function gotoSeededRecipe(page: Page): Promise<string | null> {
  const res = await page.goto(SEEDED_RECIPE_FLAT_PATH);
  if (res?.status() !== 200) return null;
  return new URL(page.url()).pathname;
}
