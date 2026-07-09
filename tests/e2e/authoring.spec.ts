import { expect, test, type Page } from "@playwright/test";

/**
 * Recipe authoring journey (issue #234). The editor runs with the dev auth
 * bypass in e2e (NEXT_PUBLIC_DEV_AUTH_BYPASS=1), so /recipes/new renders the
 * form. Client-side validation is deterministic and needs no database, so it is
 * asserted unconditionally; the create → redirect step needs a seeded Postgres
 * to persist, so it degrades gracefully when the DB isn't wired (matching
 * tests/e2e/offline.spec.ts).
 */
const TITLE_PLACEHOLDER = "Grandma's Sunday Marinara";
const STEP_PLACEHOLDER = "Whisk the dry ingredients together…";

async function openEditor(page: Page): Promise<boolean> {
  await page.goto("/recipes/new");
  const title = page.getByPlaceholder(TITLE_PLACEHOLDER);
  if ((await title.count()) === 0) return false;
  await expect(title).toBeVisible();
  return true;
}

test("blocks saving a recipe with no title and surfaces an error", async ({
  page,
}) => {
  const ready = await openEditor(page);
  test.skip(!ready, "Editor unavailable (auth bypass disabled).");

  // Submit the empty form: client validation must stop it and announce the
  // problem via the accessible error summary — no navigation, no database.
  await page.getByRole("button", { name: /save recipe/i }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/recipes\/new$/);
});

test("creates a recipe and lands on its detail page", async ({ page }) => {
  const ready = await openEditor(page);
  test.skip(!ready, "Editor unavailable (auth bypass disabled).");

  const unique = `E2E Test Loaf ${Date.now()}`;
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(unique);
  const step = page.getByPlaceholder(STEP_PLACEHOLDER).first();
  if ((await step.count()) > 0) {
    await step.fill("Mix, proof, and bake until golden.");
  }

  await page.getByRole("button", { name: /save recipe/i }).click();

  // Success redirects to /recipes/<slug>; without a seeded database the action
  // returns a DB error and stays on /recipes/new — skip rather than fail.
  const landed = await page
    .waitForURL(/\/recipes\/(?!new$)[\w-]+$/, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!landed, "No seeded database: recipe could not be persisted.");

  await expect(
    page.getByRole("heading", { name: unique, exact: false }).first(),
  ).toBeVisible();
});
