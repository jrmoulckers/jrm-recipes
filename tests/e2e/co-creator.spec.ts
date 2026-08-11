import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import postgres from 'postgres';

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
 * URL (`/recipes/...`) answers **200** carrying the not-found UI. So the status
 * code is not a usable signal on exactly the URLs the app publishes, and
 * `expect(status).toBe(404)` here would fail against correct behaviour. That
 * soft-404 is a real but *separate* pre-existing defect (#775); it is not
 * co-creation's to fix, and accommodating it silently would hide it.
 *
 * An earlier revision of this comment contrasted the above with the
 * locale-prefixed form (`/en/recipes/...`), which does answer a true 404, and
 * read that as locale routing behaving correctly. It is not: this app resolves
 * locale from a cookie and has no locale segment, so `/en/...` matches no route
 * at all. Re-measured with a nonsense control, `/en`, `/es` and `/zz` all answer
 * an identical 404 — the prefix was never a locale, and the contrast said
 * nothing about the defect.
 *
 * The security property is unaffected and was verified directly: the response
 * for a recipe that exists but is not visible to the viewer is byte-identical
 * to one for a recipe that does not exist (differing only in the per-response
 * CSP nonce), so nothing leaks existence.
 *
 * The assertion therefore reads the response document for the discriminating
 * `<link rel="canonical">`: a served recipe emits one and the not-found response
 * does not. Matching the not-found copy itself would be vacuous because that
 * markup also ships inside a successful recipe's flight payload.
 *
 * Serial, because it is one journey: each step is the previous step's
 * postcondition. It also mutates seeded data, so it resets co-creators before
 * starting rather than assuming a clean database — CI retries twice, and a
 * half-finished attempt would otherwise fail the retry with "already invited"
 * and look like a product bug.
 */

/**
 * Must match `DEV_CO_COOK` / `DEV_IDENTITY_COOKIE` in `~/server/auth/dev-user`.
 *
 * Restated rather than imported because this file is transformed by Playwright,
 * not by Next, and dragging the server module in would pull the schema barrel
 * into the test process. Restating is only safe if something notices when it
 * drifts, so `e2e-containment.test.ts` reads these literals back out of this
 * file and asserts they equal the real constants (issue #783).
 */
const DEV_IDENTITY_COOKIE = 'heirloom_dev_identity';
const CO_COOK_ID = 'e2e_usr_cocook_000000';
const CO_COOK_NAME = 'E2E Co-Cook';
const CO_COOK_SLUG = 'e2e-co-cook';
const SEEDED_RECIPE_ID = 'seed_rcp_gravy';
const OWNER_RECIPE_PATH = '/recipes/home-cook/nonnas-sunday-gravy';
/** Must match `playwright.config.ts`, which is also the server's own port. */
const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? '3000'}`;

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
  await expect.poll(() => page.locator('link[rel="canonical"]').count()).toBeGreaterThan(0);
}

async function expectRevoked(page: Page): Promise<void> {
  const response = await page.request.get(page.url(), { maxRedirects: 0 });
  expect([200, 404]).toContain(response.status());
  expect((await response.text()).toLowerCase()).not.toContain('rel="canonical"');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
}

/** A browser context authenticated as a specific dev identity. */
async function contextAs(browser: Browser, identityId?: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  if (identityId) {
    await context.addCookies([{ name: DEV_IDENTITY_COOKIE, value: identityId, url: BASE_URL }]);
  }
  return context;
}

/** The owner's co-creator panel, located by its heading's section. */
function creatorPanel(page: Page) {
  return page.getByRole('region', { name: /co-creators/i });
}

async function inviteCook(page: Page): Promise<Locator> {
  const panel = creatorPanel(page);
  const identifier = panel.getByLabel(/invite a cook/i);
  const invite = panel.getByRole('button', { name: /^Invite$/ });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await identifier.fill(CO_COOK_SLUG);
    if (
      await expect(invite)
        .toBeEnabled({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false)
    ) {
      break;
    }
  }
  await expect(invite).toBeEnabled();
  await invite.click();
  await expect(page.getByText(/invitation sent/i)).toBeVisible({
    timeout: 30_000,
  });
  return panel;
}

/**
 * Open the hydrated overflow menu rather than letting a swallowed pre-hydration
 * click make an absent owner-only action pass vacuously.
 */
async function openActionsMenu(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: /more recipe actions/i }).first();
  const print = page.getByRole('link', { name: /^print$/i });

  await expect(trigger).toBeVisible();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await print.isVisible()) return;
    await trigger.click();
    try {
      await expect(print).toBeVisible({ timeout: 10_000 });
      return;
    } catch {
      // The first click can arrive before the client trigger hydrates.
    }
  }

  throw new Error('The recipe actions menu never opened.');
}

/**
 * Remove any existing co-creator rows so the journey starts from zero.
 *
 * Idempotent and tolerant: a fresh database has no rows and this does nothing.
 */
async function resetCoCreators(page: Page): Promise<void> {
  const panel = creatorPanel(page);
  for (let i = 0; i < 5; i++) {
    const remove = panel.getByRole('button', {
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

async function setFixtureVisibility(visibility: 'public' | 'unlisted'): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('The resolved seed fixture must have a DATABASE_URL.');
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const updated = await sql`
      update recipes
      set visibility = ${visibility}
      where id = ${SEEDED_RECIPE_ID}
      returning id
    `;
    expect(updated).toHaveLength(1);
  } finally {
    await sql.end();
  }
}

async function fixtureStepHasInstruction(instruction: string): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return false;

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await sql`
      select 1
      from recipe_steps
      where recipe_id = ${SEEDED_RECIPE_ID}
        and position = 0
        and instruction = ${instruction}
    `;
    return rows.length === 1;
  } finally {
    await sql.end();
  }
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('co-creation across two identities (#698)', () => {
  let ownerContext: BrowserContext;
  let cookContext: BrowserContext;
  let owner: Page;
  let cook: Page;
  /** The owner's canonical path, e.g. /recipes/home-cook/nonnas-sunday-gravy. */
  const ownerPath = OWNER_RECIPE_PATH;
  /** The co-creator's mirror path, discovered from the panel after acceptance. */
  let mirrorPath: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    ownerContext = await contextAs(browser);
    cookContext = await contextAs(browser, CO_COOK_ID);
    owner = await ownerContext.newPage();
    cook = await cookContext.newPage();
  });

  test.afterAll(async () => {
    await ownerContext?.close();
    await cookContext?.close();
  });

  test('the two contexts really are two different people', async () => {
    await owner.goto(ownerPath);
    await expectServesRecipe(owner);
    const panel = creatorPanel(owner);
    await expect(panel).toBeVisible({ timeout: 60_000 });

    // The whole harness rests on this: if the selector silently fell back to
    // the shared dev user, both contexts would be the owner and every
    // difference asserted below would be vacuously true.
    await cook.goto(ownerPath);
    await expect(creatorPanel(cook)).toHaveCount(0);
    await expect(panel).toBeVisible();
    await resetCoCreators(owner);
  });

  test("the recipe does not answer in the invitee's namespace yet", async () => {
    await cook.goto(`/recipes/${CO_COOK_SLUG}/nonnas-sunday-gravy`);
    await expectRevoked(cook);
  });

  test('a pending invitation grants nothing', async () => {
    const panel = await inviteCook(owner);

    // The owner sees them as invited, explicitly not yet a co-creator.
    await expect(panel.getByText(/^Invited$/)).toBeVisible({ timeout: 15_000 });

    // And nothing is published in their namespace until they accept.
    await cook.goto(`/recipes/${CO_COOK_SLUG}/nonnas-sunday-gravy`);
    await expectRevoked(cook);
  });

  test("accepting publishes the recipe in the co-creator's namespace", async () => {
    await cook.goto('/notifications');
    const accept = cook.getByRole('button', { name: /^Accept$/ });
    await expect(accept.first()).toBeVisible({ timeout: 15_000 });
    await accept.first().click();
    await expect(cook.getByText(/you're now a co-creator/i)).toBeVisible({
      timeout: 30_000,
    });

    // The owner's panel is the authority on the mirror path: the co-creator's
    // slug is allocated in *their* namespace on acceptance and need not equal
    // the owner's, so reading it back beats assuming they match.
    await expect(async () => {
      await owner.goto(ownerPath);
      await expect(creatorPanel(owner).getByText(/^Co-creator$/)).toBeVisible();
    }).toPass({ timeout: 20_000 });

    const link = creatorPanel(owner).getByRole('link', {
      name: /^\/recipes\//,
    });
    mirrorPath = (await link.first().getAttribute('href'))!;
    expect(mirrorPath).toMatch(/^\/recipes\/e2e-co-cook\//);
    expect(mirrorPath).not.toBe(ownerPath);
  });

  test('the recipe answers on both paths, and the mirror points home', async () => {
    for (const [page, label] of [
      [owner, 'owner'],
      [cook, 'co-creator'],
    ] as const) {
      await page.goto(mirrorPath);
      await expectServesRecipe(page);
      expect(new URL(page.url()).pathname, `${label} stays on the mirror URL`).toBe(mirrorPath);
    }

    // SEO: N URLs resolve, exactly one is canonical, and it is the owner's.
    const canonical = await cook.locator('link[rel="canonical"]').first().getAttribute('href');
    expect(canonical, 'mirror declares a canonical').toBeTruthy();
    expect(new URL(canonical!).pathname).toBe(ownerPath);

    const ownerRes = await owner.goto(ownerPath);
    expect(ownerRes?.status()).toBe(200);
    const ownerCanonical = await owner
      .locator('link[rel="canonical"]')
      .first()
      .getAttribute('href');
    expect(new URL(ownerCanonical!).pathname).toBe(ownerPath);
  });

  test('a co-creator edit is visible under both namespaces', async () => {
    const marker = `Rested overnight ${Date.now()}`;

    await cook.goto(`${mirrorPath}/edit`);
    const firstStep = cook.getByRole('textbox', { name: /instruction/i }).first();
    await expect(firstStep).not.toHaveValue('');
    await firstStep.fill(marker);

    const save = cook.getByRole('button', { name: /save changes/i });
    let saved = false;
    for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
      await save.click();
      saved = await expect
        .poll(() => fixtureStepHasInstruction(marker), {
          timeout: 20_000,
        })
        .toBe(true)
        .then(() => true)
        .catch(() => false);
    }
    expect(saved, "the co-creator's edit completed").toBe(true);

    // This is the end-to-end fan-out property that would have caught #695.
    for (const path of [ownerPath, mirrorPath]) {
      await cook.goto(path);
      await expect(cook.getByText(marker), `the edit must be visible at ${path}`).toBeVisible();
    }
  });

  test('a co-creator is refused delete, share-link, and creator management', async () => {
    await setFixtureVisibility('unlisted');
    try {
      await cook.goto(mirrorPath);

      await expect(creatorPanel(cook)).toHaveCount(0);
      await expect(cook.getByLabel(/invite a cook/i)).toHaveCount(0);

      await openActionsMenu(cook);
      await expect(cook.getByRole('button', { name: /^delete/i })).toHaveCount(0);
      await expect(cook.getByRole('button', { name: /^leave this recipe$/i })).toBeVisible();

      await cook.getByRole('button', { name: /^share$/i }).click();
      await expect(cook.getByRole('menuitem', { name: /disable link/i })).toHaveCount(0);
      await expect(cook.getByRole('menuitem', { name: /reset link/i })).toHaveCount(0);

      // Anchor the negative assertions: the owner sees all three management
      // surfaces on the same unlisted recipe.
      await owner.goto(ownerPath);
      await expect(creatorPanel(owner)).toBeVisible();
      await openActionsMenu(owner);
      await expect(owner.getByRole('button', { name: /^delete$/i })).toBeVisible();
      await owner.getByRole('button', { name: /^share$/i }).click();
      await expect(owner.getByRole('menuitem', { name: /disable link/i })).toBeVisible();
      await expect(owner.getByRole('menuitem', { name: /reset link/i })).toBeVisible();
    } finally {
      await setFixtureVisibility('public');
    }
  });

  test('removal revokes the mirror, and never redirects', async () => {
    await owner.goto(ownerPath);
    await creatorPanel(owner)
      .getByRole('button', { name: /^Remove$/ })
      .first()
      .click();
    await expect(owner.getByText(/co-creator removed/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(creatorPanel(owner).getByText(new RegExp(CO_COOK_NAME))).toHaveCount(0, {
      timeout: 20_000,
    });

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

  test('leaving revokes exactly as removal does', async () => {
    await owner.goto(ownerPath);
    const panel = await inviteCook(owner);
    await expect(panel.getByText(/^Invited$/)).toBeVisible({ timeout: 15_000 });

    await cook.goto('/notifications');
    await cook
      .getByRole('button', { name: /^Accept$/ })
      .first()
      .click();
    await expect(cook.getByText(/you're now a co-creator/i)).toBeVisible({
      timeout: 30_000,
    });

    await expect(async () => {
      await cook.goto(mirrorPath);
      await expectServesRecipe(cook);
    }).toPass({ timeout: 20_000 });

    // Leave lives in the recipe actions menu, not the page body: it is the
    // co-creator's counterpart to the owner's Delete, and both sit behind the
    // same overflow trigger. It is not in the DOM until the menu is opened.
    await cook
      .getByRole('button', { name: /more recipe actions/i })
      .first()
      .click();
    await cook.getByRole('button', { name: /^Leave this recipe$/i }).click();
    await cook.getByRole('button', { name: /^Leave$/ }).click();
    await expect(cook.getByText(/you've left this recipe/i)).toBeVisible({
      timeout: 30_000,
    });

    await expect(async () => {
      const res = await cook.goto(mirrorPath);
      await expectRevoked(cook);
      expect(res?.request().redirectedFrom()).toBeNull();
    }).toPass({ timeout: 30_000 });
  });
});
