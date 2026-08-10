import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  canonicalHref,
  E2E_RECIPE_TITLE,
  expectNotServed,
  fixturesReady,
  IDENTITY_HANDLES,
  IDENTITY_SLUGS,
  OWNER_RECIPE_PATH,
  pageAs,
} from "./identities";

/**
 * The co-creation journey, end to end (issue #698).
 *
 * The multi-creator feature (#668) shipped with unit and component coverage but
 * no end-to-end journey, and the properties that matter most are exactly the
 * ones unit tests are weakest at:
 *
 *   - `rel=canonical` on the mirror is a *rendered-document* property. The
 *     disposition logic is unit-tested; that the tag reaches the HTML at both
 *     URLs is not.
 *   - Revocation is a *cache-invalidation* property. `revalidateRecipePaths` is
 *     unit-tested for what it purges, but "the removed creator's URL stops being
 *     served" is integration behaviour, and a stale entry would defeat it
 *     silently — the failure mode that leaks a recipe to someone whose access
 *     was withdrawn.
 *   - 404-not-308 on removal is a deliberate divergence from the
 *     alias-permanence rule (ADR 0003). A regression reintroduces a cross-user
 *     redirect that leaks both the recipe's continued existence and its current
 *     canonical URL.
 *
 * `revalidateRecipePaths` shipped with a fan-out bug of precisely this shape:
 * accepting an invitation never busted the owner's canonical page, because the
 * caller passed a slug-less stub that degraded to `/recipes/<id>`. It survived
 * three merged PRs and was found by reading, not by a test (#695). The "edit is
 * visible at *both* URLs" assertion below is the one that would have caught it.
 *
 * Serial, because this is one journey through a state machine
 * (absent → pending → accepted → removed) rather than four independent cases,
 * and each step's precondition is the previous step's outcome.
 *
 * The per-test budget is raised well above Playwright's 30 s default: each step
 * is several full server round trips (an action, a `router.refresh()`, then
 * server-rendered navigations under two namespaces), so the default is a
 * machine-speed assertion rather than a correctness one.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("co-creator journey (#698)", () => {
  let ownerContext: BrowserContext;
  let cocreatorContext: BrowserContext;
  let owner: Page;
  let cocreator: Page;
  let ready = false;

  /** The mirror path, discovered on acceptance rather than assumed. */
  let mirrorPath: string | null = null;

  test.beforeAll(async ({ browser }) => {
    // Hooks do not inherit the describe-level timeout, and this one performs the
    // first navigation of the run — the slowest, since it warms the server.
    test.setTimeout(120_000);
    ({ context: ownerContext, page: owner } = await pageAs(browser, "owner"));
    ({ context: cocreatorContext, page: cocreator } = await pageAs(
      browser,
      "cocreator",
    ));
    ready = await fixturesReady(owner);
  });

  test.afterAll(async () => {
    await ownerContext?.close();
    await cocreatorContext?.close();
  });

  test.beforeEach(() => {
    test.skip(
      !ready,
      "No seeded e2e fixtures: run `pnpm db:seed:e2e` against the test database.",
    );
  });

  test("the two contexts really are two different people", async () => {
    // The premise of every assertion below. Before #698 both contexts resolved
    // to the same shared DEV_USER, so this would have failed.
    await owner.goto(OWNER_RECIPE_PATH);
    await cocreator.goto(OWNER_RECIPE_PATH);

    // Only the owner is offered the co-creator panel on their own recipe.
    await expect(
      owner.getByRole("heading", { name: /co-creators/i }),
    ).toBeVisible();
    await expect(
      cocreator.getByRole("heading", { name: /co-creators/i }),
    ).toHaveCount(0);
  });

  test("a pending invitation grants nothing", async () => {
    // The invitee's namespace must publish no URL before they accept. Probe the
    // path the recipe would take under their slug if it were shared.
    const probe = `/recipes/${IDENTITY_SLUGS.cocreator}/shared-supper-loaf`;
    await expectNotServed(cocreator, probe);

    await owner.goto(OWNER_RECIPE_PATH);
    await owner.getByLabel(/invite a cook/i).fill(IDENTITY_HANDLES.cocreator);
    await owner.getByRole("button", { name: /^invite$/i }).click();

    // The owner sees them listed, explicitly as not-yet a co-creator. The list
    // repaints via `router.refresh()` after the action resolves, so wait for the
    // confirmation first and then give the refresh room: this is a server round
    // trip plus a re-render, not a state flip.
    await expect(owner.getByText(/invitation sent/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(owner.getByText(/^Invited$/)).toBeVisible({ timeout: 20_000 });
    await expect(
      owner.getByText(/they get no access until they accept/i),
    ).toBeVisible();

    // And the invitee still has nothing: no URL of their own, and no edit
    // affordance on the owner's page.
    await expectNotServed(cocreator, probe);

    await cocreator.goto(OWNER_RECIPE_PATH);
    await expect(cocreator.getByRole("link", { name: /edit/i })).toHaveCount(0);
  });

  /**
   * Accept the pending invitation from the invitee's notifications.
   *
   * Waits for the server action to confirm before returning: these are
   * `useTransition` actions, so navigating away while one is in flight aborts
   * it, and the next step would then assert against a state that was never
   * committed.
   */
  async function acceptInvitation(): Promise<void> {
    await cocreator.goto("/notifications");
    await cocreator
      .getByRole("button", { name: /^accept$/i })
      .first()
      .click();
    await expect(cocreator.getByText(/you're now a co-creator/i)).toBeVisible({
      timeout: 30_000,
    });
  }

  test("accepting resolves the recipe under both namespaces", async () => {
    await acceptInvitation();

    // The owner's panel now links the mirror. Read the path from there rather
    // than assuming the slug the allocator chose.
    await owner.goto(OWNER_RECIPE_PATH);
    const mirrorLink = owner.getByRole("link", {
      name: new RegExp(`^/recipes/${IDENTITY_SLUGS.cocreator}/`),
    });
    await expect(mirrorLink).toBeVisible({ timeout: 20_000 });

    mirrorPath = await mirrorLink.getAttribute("href");
    expect(mirrorPath).toBeTruthy();

    // Both namespaces answer 200. The mirror is served, not redirected.
    const ownerRes = await cocreator.goto(OWNER_RECIPE_PATH);
    expect(ownerRes?.status()).toBe(200);

    const mirrorRes = await cocreator.goto(mirrorPath!);
    expect(mirrorRes?.status()).toBe(200);
    expect(new URL(cocreator.url()).pathname).toBe(mirrorPath);
  });

  test("the mirror carries rel=canonical pointing at the owner path", async () => {
    test.skip(!mirrorPath, "Acceptance did not produce a mirror path.");

    await cocreator.goto(mirrorPath!);
    const onMirror = await canonicalHref(cocreator);
    expect(onMirror).toBeTruthy();
    expect(new URL(onMirror!).pathname).toBe(OWNER_RECIPE_PATH);

    // The owner's own page points at itself, so the mirror is the only page
    // that redirects search engines elsewhere.
    await cocreator.goto(OWNER_RECIPE_PATH);
    const onCanonical = await canonicalHref(cocreator);
    expect(onCanonical).toBeTruthy();
    expect(new URL(onCanonical!).pathname).toBe(OWNER_RECIPE_PATH);
  });

  test("a co-creator edit is visible under both namespaces", async () => {
    test.skip(!mirrorPath, "Acceptance did not produce a mirror path.");

    // This is the assertion that would have caught the #695 fan-out bug: the
    // edit lands, but the *owner's* canonical page keeps serving stale content
    // because the revalidation stub degraded to /recipes/<id>.
    const marker = `Rested overnight ${Date.now()}`;

    await cocreator.goto(`${mirrorPath}/edit`);
    // The recipe's first step, edited from the co-creator's own namespace.
    const firstStep = cocreator
      .getByRole("textbox", { name: /instruction/i })
      .first();
    await expect(firstStep).toHaveValue(/oven/i);
    await firstStep.fill(marker);
    await cocreator.getByRole("button", { name: /save changes/i }).click();
    await cocreator.waitForURL(/\/recipes\/[\w-]+\/[\w-]+$/, {
      timeout: 60_000,
    });

    for (const path of [OWNER_RECIPE_PATH, mirrorPath!]) {
      await cocreator.goto(path);
      await expect(
        cocreator.getByText(marker),
        `the edit must be visible at ${path}`,
      ).toBeVisible();
    }
  });

  /**
   * Open a recipe's overflow menu, where Delete and Leave live.
   *
   * The trigger is a client component, so a click that lands before hydration
   * is swallowed silently and the menu never opens — which reads as "the action
   * is absent" and would make the refusal assertions below pass for the wrong
   * reason. Retry until the menu is demonstrably open, keyed on Print, which
   * every viewer gets.
   */
  async function openActionsMenu(page: Page): Promise<void> {
    const trigger = page
      .getByRole("button", { name: /more recipe actions/i })
      .first();
    await expect(trigger).toBeVisible();
    const anyItem = page.getByRole("link", { name: /^print$/i });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await anyItem.isVisible()) return;
      await trigger.click();
      try {
        await expect(anyItem).toBeVisible({ timeout: 10_000 });
        return;
      } catch {
        // Not hydrated yet. Fall through and click again.
      }
    }
    throw new Error("The recipe actions menu never opened.");
  }

  test("a co-creator is refused delete, share management, and creator management", async () => {
    test.skip(!mirrorPath, "Acceptance did not produce a mirror path.");

    await cocreator.goto(mirrorPath!);

    // The co-creator panel is the owner's alone: a co-creator cannot re-share
    // the recipe onward by adding further creators.
    await expect(
      cocreator.getByRole("heading", { name: /co-creators/i }),
    ).toHaveCount(0);
    await expect(cocreator.getByLabel(/invite a cook/i)).toHaveCount(0);

    // Delete and Leave both live behind the overflow menu. A co-creator gets
    // Leave — their own counterpart to removal — but never Delete.
    await openActionsMenu(cocreator);

    await expect(
      cocreator.getByRole("button", { name: /^delete/i }),
    ).toHaveCount(0);
    await expect(
      cocreator.getByRole("button", { name: /leave this recipe/i }),
    ).toBeVisible();

    // The owner, on the same recipe, does get Delete.
    await owner.goto(OWNER_RECIPE_PATH);
    await openActionsMenu(owner);
    await expect(
      owner.getByRole("button", { name: /^delete/i }).first(),
    ).toBeVisible();
  });

  test("removal 404s the mirror, with no 308 and no alias", async () => {
    test.skip(!mirrorPath, "Acceptance did not produce a mirror path.");
    const removed = mirrorPath!;

    await owner.goto(OWNER_RECIPE_PATH);
    await owner
      .getByRole("button", { name: /^remove$/i })
      .first()
      .click();
    await expect(owner.getByText(/co-creator removed/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      owner.getByRole("link", {
        name: new RegExp(`^/recipes/${IDENTITY_SLUGS.cocreator}/`),
      }),
    ).toHaveCount(0);

    // The withdrawn URL must stop being served, and must 404 rather than 308:
    // an alias redirect would be a cross-user redirect leaking the recipe's
    // continued existence and its canonical URL — the deliberate divergence
    // from alias permanence in ADR 0003. A stale cache entry here is the
    // failure mode that leaks a recipe to someone whose access was withdrawn.
    await expectNotServed(cocreator, removed);

    // The owner's own page is unaffected.
    const ownerRes = await owner.goto(OWNER_RECIPE_PATH);
    expect(ownerRes?.status()).toBe(200);
    await expect(
      owner.getByRole("heading", { name: E2E_RECIPE_TITLE }),
    ).toBeVisible();
  });

  test("leave revokes exactly as removal does", async () => {
    // The co-creator-initiated counterpart. Re-invite, accept, then leave, and
    // assert the same revocation — a divergence between the two paths would
    // mean one of them leaves a URL serving after access ended.
    await owner.goto(OWNER_RECIPE_PATH);
    await owner.getByLabel(/invite a cook/i).fill(IDENTITY_HANDLES.cocreator);
    await owner.getByRole("button", { name: /^invite$/i }).click();
    await expect(owner.getByText(/invitation sent/i)).toBeVisible({
      timeout: 30_000,
    });

    await acceptInvitation();

    await owner.goto(OWNER_RECIPE_PATH);
    const mirrorLink = owner.getByRole("link", {
      name: new RegExp(`^/recipes/${IDENTITY_SLUGS.cocreator}/`),
    });
    await expect(mirrorLink).toBeVisible({ timeout: 20_000 });

    const rejoined = await mirrorLink.getAttribute("href");
    expect(rejoined).toBeTruthy();
    expect((await cocreator.goto(rejoined!))?.status()).toBe(200);

    await openActionsMenu(cocreator);
    await cocreator.getByRole("button", { name: /leave this recipe/i }).click();
    // The confirmation dialog's own Leave button.
    await cocreator
      .getByRole("button", { name: /^leave$/i })
      .last()
      .click();
    await expect(cocreator.getByText(/you've left this recipe/i)).toBeVisible({
      timeout: 30_000,
    });

    await cocreator.waitForURL(/\/recipes\b/, { timeout: 15_000 });

    await expectNotServed(cocreator, rejoined!);
  });
});
