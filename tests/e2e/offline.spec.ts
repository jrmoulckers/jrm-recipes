import { expect, test, type Page } from "@playwright/test";

// A public, published recipe from the seed (src/server/db/seed.ts) whose first
// step carries a timer — so the offline Cook Mode assertions have a "Start"
// button to exercise. The e2e CI job seeds Postgres so this route has content;
// without a database the recipe/Cook Mode routes 404, so those steps are guarded.
const RECIPE_SLUG = "nonnas-sunday-gravy";
const RECIPE_PATH = `/recipes/${RECIPE_SLUG}`;
const COOK_PATH = `${RECIPE_PATH}/cook`;

/**
 * Load the app and wait until the Serwist service worker is active AND controls
 * the page. Only a controlling worker intercepts fetches and fills the runtime
 * caches, which every offline assertion below depends on — so racing ahead of
 * `controller` is the main source of flakiness this guards against.
 */
async function bootServiceWorker(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) return false;
      await navigator.serviceWorker.ready;
      return navigator.serviceWorker.controller != null;
    },
    null,
    { timeout: 30_000 },
  );
}

/**
 * A seeded recipe lists ingredients, so Cook Mode opens on the mise en place
 * pre-cook screen (#402). Step through it to reach step 1 so the
 * `#current-step-title` heading is present. Mirrors tests/e2e/cook-journey.spec.ts.
 */
async function startCooking(page: Page): Promise<void> {
  const startCooking = page.getByRole("button", { name: /start cooking/i });
  if (await startCooking.count()) {
    await startCooking.first().click();
  }
}

test("serves the offline fallback for an uncached navigation", async ({
  page,
  context,
}) => {
  await bootServiceWorker(page);

  // A route that was never visited (so never cached): offline, the SW must
  // serve the precached /~offline page rather than a network error.
  await context.setOffline(true);
  await page.goto("/never-visited-offline-e2e-route");

  await expect(
    page.getByRole("heading", { name: /you.?re offline/i }),
  ).toBeVisible();

  await context.setOffline(false);
});

test("a previously opened recipe and Cook Mode work offline", async ({
  page,
  context,
}) => {
  await bootServiceWorker(page);

  // Warm the recipe + Cook Mode documents into the runtime cache while online.
  await page.goto(RECIPE_PATH);
  const cookLink = page.locator(`a[href="${COOK_PATH}"]`).first();
  if ((await cookLink.count()) === 0) {
    test.skip(
      true,
      "No seeded database: recipe route 404s, so offline recipe/Cook Mode can't be exercised.",
    );
  }
  await expect(cookLink).toBeVisible();

  await page.goto(COOK_PATH);
  await startCooking(page);
  await expect(page.locator("#current-step-title")).toBeVisible();

  // Drop the connection and confirm both still load — from the SW cache, not
  // the network.
  await context.setOffline(true);

  await page.goto(RECIPE_PATH);
  await expect(page.locator(`a[href="${COOK_PATH}"]`).first()).toBeVisible();

  await page.goto(COOK_PATH);
  await startCooking(page);
  await expect(page.locator("#current-step-title")).toBeVisible();
  // The seeded recipe's real first-step content proves Cook Mode rendered from
  // cache, not a generic offline shell.
  await expect(page.locator("#current-step-title")).toContainText(
    /brown the pork ribs/i,
  );

  // Timers are client-side, so Cook Mode stays fully functional offline.
  const startTimer = page.getByRole("button", { name: /^start$/i }).first();
  await startTimer.click();
  await expect(
    page.getByRole("button", { name: /^pause$/i }).first(),
  ).toBeVisible();
  await expect(page.locator("[role=timer]").first()).toBeVisible();

  await context.setOffline(false);
});
