import { expect, test, type Page } from '@playwright/test';

/**
 * Recipe authoring journey (issue #234). The editor runs with the dev auth
 * bypass in e2e (NEXT_PUBLIC_DEV_AUTH_BYPASS=1), so /recipes/new renders the
 * form. Client-side validation is deterministic and needs no database, so it is
 * asserted unconditionally. The create → redirect step needs a seeded Postgres
 * to persist, so it degrades gracefully when the DB isn't wired (matching
 * tests/e2e/offline.spec.ts).
 */
const TITLE_PLACEHOLDER = "Grandma's Sunday Marinara";
const STEP_PLACEHOLDER = 'Whisk the dry ingredients together…';

async function openEditor(page: Page): Promise<boolean> {
  await page.goto('/recipes/new');
  const title = page.getByPlaceholder(TITLE_PLACEHOLDER);
  if ((await title.count()) === 0) return false;
  await expect(title).toBeVisible();
  return true;
}

test('blocks saving a recipe with no title and surfaces an error', async ({ page }) => {
  const ready = await openEditor(page);
  test.skip(!ready, 'Editor unavailable (auth bypass disabled).');

  // Submit the empty form: client validation must stop it and announce the
  // problem via the accessible error summary, with no navigation or database.
  await page.getByRole('button', { name: /save recipe/i }).click();

  // Scope to the editor's error summary by its accessible name. A bare
  // getByRole("alert") also matches Next's empty route announcer
  // (#__next-route-announcer__, role="alert"), which trips strict mode.
  await expect(page.getByRole('alert', { name: /please fix/i })).toBeVisible();
  await expect(page).toHaveURL(/\/recipes\/new$/);
});

test('creates a recipe and lands on its detail page', async ({ page }) => {
  const ready = await openEditor(page);
  test.skip(!ready, 'Editor unavailable (auth bypass disabled).');

  const unique = `E2E Test Loaf ${Date.now()}`;
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(unique);
  const step = page.getByPlaceholder(STEP_PLACEHOLDER).first();
  if ((await step.count()) > 0) {
    await step.fill('Mix, proof, and bake until golden.');
  }

  await page.getByRole('button', { name: /save recipe/i }).click();

  // Success redirects to the recipe's canonical detail page. That became
  // `/recipes/<cook>/<slug>` in #666; the old single-segment pattern matched a
  // shape the app had stopped producing, so this waited out its full timeout on
  // every run and then blamed a database that was in fact seeded (#849).
  const landed = await page
    .waitForURL(/\/recipes\/[\w-]+\/(?!new$)[\w-]+$/, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!landed, 'No seeded database: recipe could not be persisted.');

  await expect(page.getByRole('heading', { name: unique, exact: false }).first()).toBeVisible();
});

test('creates a recipe with the guided flow at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/recipes/new?flow=guided');

  const heading = page.getByRole('heading', { name: 'Add a recipe', exact: true });
  if ((await heading.count()) === 0) {
    test.skip(true, 'Guided editor unavailable (auth bypass disabled).');
  }
  await expect(heading).toBeVisible();

  const unique = `Guided E2E Pie ${Date.now()}`;
  await page.getByLabel('Recipe name').fill(unique);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Ingredient 1', { exact: true }).fill('4 apples');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Step 1', { exact: true }).fill('Slice the apples and bake until tender.');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: /does everything look right/i })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  await expect(page.getByRole('button', { name: 'Save recipe' })).toBeVisible();

  await page.getByRole('button', { name: 'Save recipe' }).click();
  const landed = await page
    .waitForURL(/\/recipes\/[\w-]+\/(?!new$)[\w-]+$/, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!landed, 'No seeded database: guided recipe could not be persisted.');

  await expect(page.getByRole('heading', { name: unique, exact: false }).first()).toBeVisible();
});
