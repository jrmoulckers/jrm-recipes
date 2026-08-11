import { expect, test, type APIResponse } from '@playwright/test';

/**
 * The not-found response contract for the `(main)` tree (#775).
 *
 * Every `(main)` route is rendered inside a Suspense boundary, so by the time an
 * awaited existence check calls `notFound()` the response headers have already
 * been sent and Next cannot change the status. Measured on a production build
 * against a live database: a URL that matches no route at all answers a true
 * 404, while an unresolvable *recipe*, *cook*, *group* or *collection* answers
 * **200** carrying the not-found UI. Removing `loading.tsx`, moving the
 * `notFound()` into `generateMetadata`, adding a group-level `not-found.tsx`,
 * and awaiting the page body above the message provider were each measured and
 * each left the status at 200 — the soft 404 is a documented consequence of
 * streaming, not a defect in any one of those places.
 *
 * What keeps that from becoming an SEO problem is the `noindex` robots tag Next
 * emits with the not-found UI: a soft 404 that is `noindex` is dropped from the
 * index, whereas a `200` *without* it is an indexable "not found" page. Nothing
 * asserted that tag, so this pins it.
 *
 * Deliberately **not** pinned: the status code itself. Asserting `200` would
 * enshrine the current behaviour and fail the day the soft 404 is fixed, so a
 * true 404 is accepted here too — but `noindex` is required either way.
 */

/**
 * URLs that cannot resolve to content. They need no seeded data: the segments
 * are chosen so the lookup finds nothing. Hand-written rather than derived, so
 * a rot in the route tree cannot quietly shrink the set.
 */
const UNRESOLVABLE_PATHS = [
  '/recipes/no-such-cook/no-such-recipe',
  '/cooks/no-such-cook',
  '/groups/no-such-group',
  '/collections/999999999',
] as const;

/** Pins the loop below against iterating an empty list (a vacuous pass). */
const EXPECTED_CHECKED = 4;

function hasNoindex(html: string): boolean {
  return /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html);
}

/** A 5xx means the app has no database wired; the URL never reached a lookup. */
function databaseMissing(response: APIResponse): boolean {
  return response.status() >= 500;
}

test('unresolvable (main) URLs are excluded from search indexes', async ({ page }) => {
  let checked = 0;

  for (const path of UNRESOLVABLE_PATHS) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    test.skip(databaseMissing(response), 'No database wired: the route cannot run its lookup.');

    // A true 404 is the better answer and is accepted; what must always hold is
    // that the response is not offered to a crawler as indexable content.
    expect([200, 404], `${path} answers a not-found status`).toContain(response.status());
    expect(hasNoindex(await response.text()), `${path} is noindex`).toBe(true);

    checked += 1;
  }

  expect(checked, 'every listed path was actually checked').toBe(EXPECTED_CHECKED);
});

test('a URL matching no route still answers a true 404', async ({ page }) => {
  const response = await page.request.get('/totally-missing-page', { maxRedirects: 0 });

  // Unmatched URLs are resolved before rendering starts, so this one is not
  // subject to the streaming limitation above. It is the control proving the
  // soft 404 is specific to in-render `notFound()`, not a blanket loss of 404s.
  expect(response.status()).toBe(404);
  expect(hasNoindex(await response.text())).toBe(true);
});

test('a page that does resolve is left indexable', async ({ page }) => {
  const response = await page.request.get('/', { maxRedirects: 0 });
  test.skip(databaseMissing(response), 'No database wired.');

  // Positive control. Without it, blanket-noindexing every response would
  // satisfy the assertions above while destroying the site's indexability.
  expect(response.status()).toBe(200);
  expect(hasNoindex(await response.text())).toBe(false);
});
