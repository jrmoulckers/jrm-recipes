import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { gotoSeededRecipe } from './recipe-paths';

const SERIOUS_OR_CRITICAL = new Set(['serious', 'critical']);

test.describe.configure({ mode: 'default' });

async function setDisplayPreferences(
  context: BrowserContext,
  baseURL: string | undefined,
  {
    theme = 'kitchen',
    highContrast = false,
  }: { theme?: 'kitchen' | 'kids'; highContrast?: boolean } = {},
) {
  if (baseURL === undefined) throw new Error('Playwright baseURL is required.');

  const cookies = [
    { name: 'heirloom-theme', value: theme, url: baseURL },
    { name: 'heirloom-scheme', value: 'light', url: baseURL },
  ];

  if (highContrast) {
    cookies.push({
      name: 'heirloom-a11y',
      value: encodeURIComponent(
        JSON.stringify({ textSize: 'default', contrast: 'on', reading: false }),
      ),
      url: baseURL,
    });
  }

  await context.addCookies(cookies);
}

async function expectNoSeriousOrCriticalViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations.filter(({ impact }) =>
    typeof impact === 'string' ? SERIOUS_OR_CRITICAL.has(impact) : false,
  );

  expect(violations).toEqual([]);
}

test.beforeEach(async ({ context, baseURL }) => {
  await setDisplayPreferences(context, baseURL);
});

test('home has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

  await expectNoSeriousOrCriticalViolations(page);
});

test('recipes list has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/recipes');
  await expect(page.getByRole('heading', { name: /your cookbook/i })).toBeVisible();

  await expectNoSeriousOrCriticalViolations(page);
});

test('seeded recipe detail has no serious or critical accessibility violations', async ({
  page,
}) => {
  const recipePath = await gotoSeededRecipe(page);
  test.skip(recipePath === null, 'No database configured: seeded recipe detail is unavailable.');

  await expectNoSeriousOrCriticalViolations(page);
});

test('recipe editor has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/recipes/new?flow=full');
  await expect(page.getByRole('heading', { name: 'New recipe', exact: true })).toBeVisible();

  await expectNoSeriousOrCriticalViolations(page);
});

test('Cook Mode has no serious or critical accessibility violations', async ({ page }) => {
  const recipePath = await gotoSeededRecipe(page);
  test.skip(recipePath === null, 'No database configured: Cook Mode is unavailable.');

  await page.goto(`${recipePath}/cook`);
  const startCooking = page.getByTestId('cook-mode-start');
  if (await startCooking.isVisible()) await startCooking.click();
  await expect(page.locator('#current-step-title')).toBeVisible();

  await expectNoSeriousOrCriticalViolations(page);
});

test('Kids mode has no serious or critical accessibility violations', async ({
  page,
  context,
  baseURL,
}) => {
  await setDisplayPreferences(context, baseURL, { theme: 'kids' });
  await page.goto('/recipes');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'kids');
  await expect(page.getByRole('heading', { name: /your cookbook/i })).toBeVisible();

  await expectNoSeriousOrCriticalViolations(page);
});

test('high contrast has no serious or critical accessibility violations', async ({
  page,
  context,
  baseURL,
}) => {
  await setDisplayPreferences(context, baseURL, { highContrast: true });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

  await expectNoSeriousOrCriticalViolations(page);
});
