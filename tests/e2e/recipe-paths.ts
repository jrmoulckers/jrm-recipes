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
 * How long to keep looking for the seeded recipe before deciding it is absent.
 *
 * A single probe made a transient sitemap failure indistinguishable from an
 * unseeded database, and the spec then skipped itself on an unrelated PR (#870).
 * Retrying costs nothing on the healthy path, which resolves on attempt one.
 */
const RESOLVE_ATTEMPTS = 5;
const RESOLVE_RETRY_MS = 1_000;

/**
 * Whether the app reports a database at all.
 *
 * `/api/health` answers `db: "not_configured"` in zero-config mode and `"ok"` or
 * `"degraded"` otherwise, so it distinguishes *no database* from *a database
 * that is present but did not serve what we expected*. Those are the two things
 * the old single `null` return conflated (#870).
 *
 * A degraded database answers 503, so `ok()` is false while a database plainly
 * exists — hence the status is not used as the signal. Anything other than an
 * explicit `not_configured` counts as configured, because failing loudly on an
 * ambiguous probe is safer than skipping on one.
 */
async function databaseIsConfigured(page: Page): Promise<boolean> {
  const response = await page.request.get('/api/health');

  try {
    const body: unknown = await response.json();
    const db = (body as { db?: unknown }).db;
    return db !== 'not_configured';
  } catch {
    return true;
  }
}

/**
 * What an unresolved seeded recipe means, given whether a database exists.
 *
 * Split out from the navigation so the decision can be asserted directly. The
 * bug in #870 was never in the probing; it was here, in treating every failure
 * to resolve as evidence of a missing database — a cause the helper never
 * checked. The skip message said "No seeded database" while the database was
 * seeded and reachable.
 */
export function unresolvedSeededRecipe(
  dbConfigured: boolean,
  diagnosis: string,
): { skip: boolean; message: string } {
  if (!dbConfigured) {
    return {
      skip: true,
      message: `No database configured (/api/health reports db: "not_configured"), so the seeded recipe cannot exist. ${diagnosis}`,
    };
  }

  return {
    skip: false,
    message:
      'The seeded recipe did not resolve, but a database IS configured, so this is a real failure ' +
      'rather than a missing precondition. Run `pnpm db:seed` if this is a local checkout. ' +
      `Observed: ${diagnosis}`,
  };
}

/**
 * Navigate to the seeded recipe and return its canonical path.
 *
 * Resolution goes through `/sitemap.xml` rather than a constructed URL: recipes
 * live at `/recipes/<cook>/<slug>`, so building the path here would couple every
 * spec to the seed's user slug. The sitemap is the app's own statement of which
 * path is canonical (ADR-0003 lists the owner path and omits creator mirrors),
 * and unlike the `/recipes` index it is unpaginated — so it stays correct as
 * specs add recipes of their own.
 *
 * **The HTTP status cannot be used to detect failure.** Every unresolvable
 * `(main)` URL answers 200 (#775), so a status check accepts the not-found page
 * as a success — which is how #843's four skips came to blame an absent
 * database that was in fact seeded (#849). Resolution is therefore confirmed by
 * the recipe heading actually being on the page.
 *
 * Returns `null` only when the app reports no database at all, which is the one
 * condition the callers' "No seeded database" skip actually describes (#870).
 * When a database *is* configured this throws instead of returning `null`, so an
 * unmet precondition fails loudly rather than skipping. A skipped test is not a
 * passing test, and a skip that names a cause nobody checked is worse than a
 * failure: it reads as housekeeping.
 */
export async function gotoSeededRecipe(page: Page): Promise<string | null> {
  const dbConfigured = await databaseIsConfigured(page);

  let diagnosis = 'the sitemap was never probed';

  for (let attempt = 1; attempt <= RESOLVE_ATTEMPTS; attempt += 1) {
    const sitemap = await page.request.get('/sitemap.xml');

    if (sitemap.ok()) {
      const locs = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
      const match = locs.find((loc) => new URL(loc).pathname.endsWith(`/${SEEDED_RECIPE_SLUG}`));

      if (match !== undefined) {
        await page.goto(new URL(match).pathname);

        // The status is not an oracle (#775), so confirm the recipe actually
        // rendered rather than the not-found page that answers 200 in its place.
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        return new URL(page.url()).pathname;
      }

      diagnosis = `GET /sitemap.xml listed ${locs.length} URL(s), none ending in "/${SEEDED_RECIPE_SLUG}"`;
    } else {
      diagnosis = `GET /sitemap.xml answered ${sitemap.status()}`;
    }

    if (attempt < RESOLVE_ATTEMPTS) await page.waitForTimeout(RESOLVE_RETRY_MS);
  }

  const outcome = unresolvedSeededRecipe(
    dbConfigured,
    `${diagnosis} (after ${RESOLVE_ATTEMPTS} attempts)`,
  );
  if (outcome.skip) return null;
  throw new Error(outcome.message);
}
