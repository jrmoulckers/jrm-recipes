import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { SEEDED_RECIPE_SLUG } from "./recipe-paths";

/**
 * Co-creation journey across two identities (issue #698).
 *
 * Every other spec runs as one person, because the dev bypass resolved to a
 * single shared user. Co-creation is *defined* by the difference between two
 * viewers — the owner manages, the invitee cannot; the recipe answers under one
 * namespace, then two, then one again — so none of it was reachable before the
 * identity selector landed.
 *
 * The assertions here are deliberately the ones unit tests are weakest at:
 *
 * - `rel=canonical` on the mirror is a *rendered document* property. The
 *   disposition logic is unit-tested; that the tag reaches the HTML at both
 *   URLs is not.
 * - Revocation is asserted end-to-end on the real URL: after removal the mirror
 *   stops serving and does not redirect. Note what this does *not* prove. The
 *   header of this file used to claim it covered cache invalidation; it does
 *   not, and that was measured rather than reasoned. Dropping the removed
 *   creator's namespace from the revalidation fan-out — the deliberate
 *   `extraCreators` argument in `creators-actions.ts` — leaves this whole spec
 *   green, because every route is dynamic today (#193: `cookies()` in the root
 *   layout), so there is no cached entry to go stale. That wiring is guarded
 *   instead by `creators-revocation.test.ts`, which is where the property has a
 *   home that can actually fail.
 * - not-found-rather-than-308 on removal is a deliberate divergence from the
 *   alias-permanence rule (ADR 0003). A regression reintroduces a cross-user
 *   redirect that leaks both the recipe's continued existence and its current
 *   canonical URL.
 *
 * ## Why revocation is asserted on the rendered page, not on HTTP 404
 *
 * Measured against a seeded build: an unresolvable recipe under a default-locale
 * URL (`/recipes/...`) answers **200** carrying the not-found UI, while the
 * locale-prefixed form (`/en/recipes/...`) answers a true 404. So the status
 * code is not a usable signal on exactly the URLs the app publishes, and
 * `expect(status).toBe(404)` here would fail against correct behaviour. That
 * soft-404 is a real but *separate* pre-existing defect (filed on its own); it
 * is not co-creation's to fix, and accommodating it silently would hide it.
 *
 * The security property is unaffected and was verified directly: the response
 * for a recipe that exists but is not visible to the viewer is byte-identical
 * to one for a recipe that does not exist (differing only in the per-response
 * CSP nonce), so nothing leaks existence.
 *
 * The assertion therefore reads the *document*: a served recipe renders
 * `<link rel="canonical">`, and the not-found page does not. Note that matching
 * raw HTML would be vacuous — the not-found markup ships inside the flight
 * payload of a *successful* recipe response too, so a naive body/text match is
 * true on both. These use visible-role queries, which see rendered output only.
 *
 * Serial, because it is one journey: each step is the previous step's
 * postcondition. It also mutates seeded data, so it resets co-creators before
 * starting rather than assuming a clean database — CI retries twice, and a
 * half-finished attempt would otherwise fail the retry with "already invited"
 * and look like a product bug.
 */

/** Must match `DEV_CO_COOK` / `DEV_IDENTITY_COOKIE` in `~/server/auth/dev-user`. */
const DEV_IDENTITY_COOKIE = "heirloom_dev_identity";
const CO_COOK_ID = "seed_usr_rosa";
const CO_COOK_NAME = "Aunt Rosa";
/** Must match `playwright.config.ts`, which is also the server's own port. */
const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3000"}`;

/**
 * Assert the page is serving the recipe, or is not.
 *
 * `rel=canonical` is the discriminator: every resolving recipe page emits one
 * (owner and mirror alike, per ADR 0003) and the not-found page emits none.
 *
 * Presence, not an exact count: after a server action the client router can
 * briefly hold two canonical elements in the live DOM. The *response* HTML has
 * exactly one — verified directly, and that is what a crawler consumes — so
 * pinning the DOM count here would assert a client-side artifact rather than
 * the SEO property. Which URL is canonical is asserted separately.
 */
async function expectServesRecipe(page: Page): Promise<void> {
  await expect
    .poll(() => page.locator('link[rel="canonical"]').count())
    .toBeGreaterThan(0);
}

async function expectRevoked(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: /couldn't find that page/i }),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
}

/** A browser context authenticated as a specific dev identity. */
async function contextAs(
  browser: Browser,
  identityId?: string,
): Promise<BrowserContext> {
  const context = await browser.newContext();
  if (identityId) {
    await context.addCookies([
      { name: DEV_IDENTITY_COOKIE, value: identityId, url: BASE_URL },
    ]);
  }
  return context;
}

/** The owner's co-creator panel, located by its heading's section. */
function creatorPanel(page: Page) {
  return page.getByRole("region", { name: /co-creators/i });
}

/**
 * Navigate to the seeded recipe, returning the canonical path it settles on,
 * or null when it did not resolve (no seeded database).
 *
 * Deliberately *not* via the flat legacy path (`/recipes/<slug>`): that only
 * resolves through a `recipe_slug_aliases` row, which a freshly seeded database
 * does not have, so it answers not-found on a perfectly good database. The
 * recipes index is the honest entry point, and following a real link also keeps
 * the spec uncoupled from the seed's user slug.
 *
 * Status is not the signal either — an unresolvable recipe still answers 200
 * under a default-locale URL (see the header note), so a status check would
 * report a missing database as a present one and the journey would fail
 * downstream with a misleading error. `rel=canonical` only appears when the
 * recipe actually resolved.
 */
async function gotoRecipe(page: Page): Promise<string | null> {
  await page.goto("/recipes");
  const link = page.locator(`a[href$="/${SEEDED_RECIPE_SLUG}"]`).first();
  if ((await link.count()) === 0) return null;
  const href = await link.getAttribute("href");
  if (!href) return null;
  await page.goto(href);
  if ((await page.locator('link[rel="canonical"]').count()) === 0) return null;
  return new URL(page.url()).pathname;
}

/**
 * Remove any existing co-creator rows so the journey starts from zero.
 *
 * Idempotent and tolerant: a fresh database has no rows and this does nothing.
 */
async function resetCoCreators(page: Page): Promise<void> {
  const panel = creatorPanel(page);
  for (let i = 0; i < 5; i++) {
    const remove = panel.getByRole("button", {
      name: /^(Remove|Cancel invite)$/,
    });
    if ((await remove.count()) === 0) return;
    await remove.first().click();
    await expect(async () => {
      await page.reload();
      await expect(panel).toBeVisible();
    }).toPass({ timeout: 15_000 });
  }
}

test.describe.serial("co-creation across two identities (#698)", () => {
  let ownerContext: BrowserContext;
  let cookContext: BrowserContext;
  let owner: Page;
  let cook: Page;
  /** The owner's canonical path, e.g. /recipes/home-cook/nonnas-sunday-gravy. */
  let ownerPath: string;
  /** The co-creator's mirror path, discovered from the panel after acceptance. */
  let mirrorPath: string;

  test.beforeAll(async ({ browser }) => {
    ownerContext = await contextAs(browser);
    cookContext = await contextAs(browser, CO_COOK_ID);
    owner = await ownerContext.newPage();
    cook = await cookContext.newPage();
  });

  test.afterAll(async () => {
    await ownerContext?.close();
    await cookContext?.close();
  });

  test("the two contexts really are two different people", async () => {
    const settled = await gotoRecipe(owner);
    test.skip(settled === null, "No seeded database: recipe did not resolve.");
    ownerPath = settled!;

    const panel = creatorPanel(owner);
    test.skip(
      (await panel.count()) === 0,
      "Co-creator panel unavailable (not the owner, or bypass disabled).",
    );

    // The whole harness rests on this: if the selector silently fell back to
    // the shared dev user, both contexts would be the owner and every
    // difference asserted below would be vacuously true.
    await cook.goto(ownerPath);
    await expect(creatorPanel(cook)).toHaveCount(0);
    await expect(panel).toBeVisible();

    await resetCoCreators(owner);
  });

  test("the recipe does not answer in the invitee's namespace yet", async () => {
    await cook.goto(`/recipes/aunt-rosa/nonnas-sunday-gravy`);
    await expectRevoked(cook);
  });

  test("a pending invitation grants nothing", async () => {
    await owner.goto(ownerPath);
    const panel = creatorPanel(owner);
    await panel.getByLabel(/invite a cook/i).fill("aunt-rosa");
    await panel.getByRole("button", { name: /^Invite$/ }).click();

    // The owner sees them as invited, explicitly not yet a co-creator.
    await expect(panel.getByText(/^Invited$/)).toBeVisible({ timeout: 15_000 });

    // And nothing is published in their namespace until they accept.
    await cook.goto(`/recipes/aunt-rosa/nonnas-sunday-gravy`);
    await expectRevoked(cook);
  });

  test("accepting publishes the recipe in the co-creator's namespace", async () => {
    await cook.goto("/notifications");
    const accept = cook.getByRole("button", { name: /^Accept$/ });
    await expect(accept.first()).toBeVisible({ timeout: 15_000 });
    await accept.first().click();

    // The owner's panel is the authority on the mirror path: the co-creator's
    // slug is allocated in *their* namespace on acceptance and need not equal
    // the owner's, so reading it back beats assuming they match.
    await expect(async () => {
      await owner.goto(ownerPath);
      await expect(creatorPanel(owner).getByText(/^Co-creator$/)).toBeVisible();
    }).toPass({ timeout: 20_000 });

    const link = creatorPanel(owner).getByRole("link", {
      name: /^\/recipes\//,
    });
    mirrorPath = (await link.first().getAttribute("href"))!;
    expect(mirrorPath).toMatch(/^\/recipes\/aunt-rosa\//);
    expect(mirrorPath).not.toBe(ownerPath);
  });

  test("the recipe answers on both paths, and the mirror points home", async () => {
    for (const [page, label] of [
      [owner, "owner"],
      [cook, "co-creator"],
    ] as const) {
      await page.goto(mirrorPath);
      await expectServesRecipe(page);
      expect(
        new URL(page.url()).pathname,
        `${label} stays on the mirror URL`,
      ).toBe(mirrorPath);
    }

    // SEO: N URLs resolve, exactly one is canonical, and it is the owner's.
    const canonical = await cook
      .locator('link[rel="canonical"]')
      .first()
      .getAttribute("href");
    expect(canonical, "mirror declares a canonical").toBeTruthy();
    expect(new URL(canonical!).pathname).toBe(ownerPath);

    const ownerRes = await owner.goto(ownerPath);
    expect(ownerRes?.status()).toBe(200);
    const ownerCanonical = await owner
      .locator('link[rel="canonical"]')
      .first()
      .getAttribute("href");
    expect(new URL(ownerCanonical!).pathname).toBe(ownerPath);
  });

  test("removal revokes the mirror, and never redirects", async () => {
    await owner.goto(ownerPath);
    await creatorPanel(owner)
      .getByRole("button", { name: /^Remove$/ })
      .first()
      .click();
    await expect(
      creatorPanel(owner).getByText(new RegExp(CO_COOK_NAME)),
    ).toHaveCount(0, { timeout: 20_000 });

    // The cached page must stop being served, and it must not redirect: a 308
    // to the owner's path would leak both that the recipe still exists and
    // where it now lives (ADR 0003).
    await expect(async () => {
      const res = await cook.goto(mirrorPath);
      await expectRevoked(cook);
      expect(res?.request().redirectedFrom()).toBeNull();
      expect(new URL(cook.url()).pathname).toBe(mirrorPath);
    }).toPass({ timeout: 30_000 });

    // The owner's own page is untouched by the revocation.
    await owner.goto(ownerPath);
    await expectServesRecipe(owner);
  });

  test("leaving revokes exactly as removal does", async () => {
    await owner.goto(ownerPath);
    const panel = creatorPanel(owner);
    await panel.getByLabel(/invite a cook/i).fill("aunt-rosa");
    await panel.getByRole("button", { name: /^Invite$/ }).click();
    await expect(panel.getByText(/^Invited$/)).toBeVisible({ timeout: 15_000 });

    await cook.goto("/notifications");
    await cook
      .getByRole("button", { name: /^Accept$/ })
      .first()
      .click();

    await expect(async () => {
      await cook.goto(mirrorPath);
      await expectServesRecipe(cook);
    }).toPass({ timeout: 20_000 });

    // Leave lives in the recipe actions menu, not the page body: it is the
    // co-creator's counterpart to the owner's Delete, and both sit behind the
    // same overflow trigger. It is not in the DOM until the menu is opened.
    await cook
      .getByRole("button", { name: /more recipe actions/i })
      .first()
      .click();
    await cook.getByRole("button", { name: /^Leave this recipe$/i }).click();
    await cook.getByRole("button", { name: /^Leave$/ }).click();

    await expect(async () => {
      const res = await cook.goto(mirrorPath);
      await expectRevoked(cook);
      expect(res?.request().redirectedFrom()).toBeNull();
    }).toPass({ timeout: 30_000 });
  });
});
