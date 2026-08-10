import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/**
 * Two-identity support for end-to-end specs (issue #698).
 *
 * The suite runs with `NEXT_PUBLIC_DEV_AUTH_BYPASS=1`, which used to resolve
 * every browser context to the one shared `DEV_USER`. Co-creation is defined
 * entirely by two identities behaving differently — the owner invites and
 * manages, the invitee has no access at all until they accept — so none of it
 * was assertable. `playwright.config.ts` additionally sets the server-only
 * `E2E_IDENTITY_SELECTOR=1`, which lets a context name which seeded fixture it
 * is by sending one cookie.
 *
 * The selector cannot be used to assume a real account. It resolves only keys
 * of a frozen allowlist, only inside the dev-bypass branch, only after
 * `assertDevBypassAllowed` has already permitted that branch, and only when the
 * server-only flag is set. See `E2E_IDENTITIES` in `src/server/auth/dev-user.ts`
 * for the full argument.
 */

/** Must match `E2E_IDENTITY_COOKIE` in `src/server/auth/dev-user.ts`. */
const IDENTITY_COOKIE = "heirloom_e2e_identity";

/** Must match the keys of `E2E_IDENTITIES`. */
export type Identity = "owner" | "cocreator";

/** Must match the fixtures' `users.slug`, and `E2E_RECIPE` in the e2e seed. */
export const IDENTITY_SLUGS: Record<Identity, string> = {
  owner: "e2e-owner",
  cocreator: "e2e-cocreator",
};

export const IDENTITY_HANDLES: Record<Identity, string> = {
  owner: "e2e-owner",
  cocreator: "e2e-cocreator",
};

export const E2E_RECIPE_SLUG = "shared-supper-loaf";
export const E2E_RECIPE_TITLE = "Shared Supper Loaf";

/** The owner's canonical path for the seeded co-creation recipe. */
export const OWNER_RECIPE_PATH = `/recipes/${IDENTITY_SLUGS.owner}/${E2E_RECIPE_SLUG}`;

/**
 * A browser context authenticated as one of the seeded fixtures.
 *
 * The cookie is set on the context rather than the page so it applies uniformly
 * to document requests, server-action POSTs and client fetches — a spec never
 * has to remember to attach it.
 */
export async function contextAs(
  browser: Browser,
  identity: Identity,
): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: IDENTITY_COOKIE,
      value: identity,
      domain: "localhost",
      path: "/",
    },
  ]);
  return context;
}

/** Open a page already acting as `identity`. */
export async function pageAs(
  browser: Browser,
  identity: Identity,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await contextAs(browser, identity);
  return { context, page: await context.newPage() };
}

/**
 * Whether the seeded co-creation fixtures are present.
 *
 * The fixtures come from `pnpm db:seed:e2e`, which only CI's e2e job runs, so a
 * local run against an unseeded database skips rather than fails — matching the
 * degradation in `authoring.spec.ts` and `offline.spec.ts`.
 */
export async function fixturesReady(page: Page): Promise<boolean> {
  const res = await page.goto(OWNER_RECIPE_PATH);
  return res?.status() === 200;
}

/**
 * The `href` of the rendered `<link rel="canonical">`, or null.
 *
 * Read from the document rather than from the metadata helpers on purpose: that
 * the tag actually reaches the HTML at both URLs is precisely the property unit
 * tests cannot see.
 */
export async function canonicalHref(page: Page): Promise<string | null> {
  const link = page.locator('link[rel="canonical"]').first();
  if ((await link.count()) === 0) return null;
  return link.getAttribute("href");
}

/**
 * Assert a recipe URL is not served to this viewer.
 *
 * The property #698 needs is that a URL stops serving the recipe *and never
 * 308s to the owner's canonical path* — a cross-user redirect would leak both
 * the recipe's continued existence and its current canonical URL, which is the
 * deliberate divergence from alias permanence in ADR 0003. Both halves are
 * asserted exactly.
 *
 * What is deliberately **not** asserted is the status code. The namespaced
 * recipe route currently answers a *soft* 404: `notFound()` is called
 * correctly, but `loading.tsx` under `(main)` flushes the streamed shell first,
 * so the 200 status line is already committed (issue #775, pre-existing and out
 * of scope here). Pinning `404` today would fail; pinning `200` would enshrine
 * the bug. So this asserts the observable behaviour instead — no redirect, and
 * the recipe itself is gone — and returns the status for the caller to log.
 *
 * When #775 is fixed, tighten this to `expect(res.status()).toBe(404)` and
 * delete the paragraph above.
 */
export async function expectNotServed(
  page: Page,
  path: string,
): Promise<number> {
  const res = await page.goto(path);
  expect(res, `${path} produced no response`).not.toBeNull();

  // No 308: the response is for the requested URL itself, not a redirect target.
  expect(res!.request().redirectedFrom()).toBeNull();
  expect(new URL(page.url()).pathname).toBe(path);

  // And the recipe is not rendered under this URL.
  await expect(
    page.getByRole("heading", { name: E2E_RECIPE_TITLE }),
    `${path} must not render the recipe`,
  ).toHaveCount(0);

  return res!.status();
}
