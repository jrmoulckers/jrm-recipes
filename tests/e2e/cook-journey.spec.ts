import { expect, test, type Page } from "@playwright/test";

/**
 * Cook Mode step-through journey (issue #240). Cook Mode is a client component,
 * so once the recipe document is served its Previous/Next navigation and
 * keyboard shortcuts work without further network I/O — which is exactly what we
 * assert here.
 *
 * The e2e CI job seeds Postgres so this public recipe exists; without a seeded
 * database the immersive route 404s (no step heading), so the spec skips rather
 * than fail. Mirrors tests/e2e/offline.spec.ts.
 */
const RECIPE_SLUG = "nonnas-sunday-gravy";
const COOK_PATH = `/recipes/${RECIPE_SLUG}/cook`;

const STEP_TITLE = "#current-step-title";

async function openCookMode(page: Page): Promise<boolean> {
  await page.goto(COOK_PATH);
  // A seeded recipe lists ingredients, so Cook Mode opens on the mise en place
  // pre-cook screen (#402); step through it to reach step 1.
  const startCooking = page.getByRole("button", { name: /start cooking/i });
  if (await startCooking.count()) {
    await startCooking.first().click();
  }
  const title = page.locator(STEP_TITLE);
  if ((await title.count()) === 0) return false;
  await expect(title).toBeVisible();
  return true;
}

test("steps forward and back through Cook Mode", async ({ page }) => {
  const ready = await openCookMode(page);
  test.skip(!ready, "No seeded database: Cook Mode route has no content.");

  const title = page.locator(STEP_TITLE);
  const firstStep = (await title.textContent())?.trim() ?? "";
  expect(firstStep.length).toBeGreaterThan(0);

  // "Previous" is unavailable on the first step.
  const previous = page.getByRole("button", { name: /^previous$/i });
  await expect(previous).toBeDisabled();

  // Advance one step; the visible step heading must change.
  await page.getByRole("button", { name: /^next$/i }).first().click();
  await expect
    .poll(async () => (await title.textContent())?.trim())
    .not.toBe(firstStep);

  // "Previous" is now enabled and returns to the opening step.
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(title).toHaveText(firstStep);
});

test("keyboard shortcuts drive Cook Mode navigation", async ({ page }) => {
  const ready = await openCookMode(page);
  test.skip(!ready, "No seeded database: Cook Mode route has no content.");

  const title = page.locator(STEP_TITLE);
  const firstStep = (await title.textContent())?.trim() ?? "";

  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await title.textContent())?.trim())
    .not.toBe(firstStep);

  await page.keyboard.press("ArrowLeft");
  await expect(title).toHaveText(firstStep);
});
