import { expect, test } from '@playwright/test';

// Pinned to the server's test-only selector by e2e-containment.test.ts.
const DEV_IDENTITY_COOKIE = 'heirloom_dev_identity';
const GUEST_IDENTITY = 'e2e_signed_out';
const SOURCE_URL = 'https://heirloom.jrmoulckers.com/recipes/spaghetti-carbonara';
const SOURCE_TEXT = 'QA toast\n\nIngredients\n1 slice bread\n\nInstructions\n1. Toast the bread.';

test.beforeEach(async ({ baseURL, context, page }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('The guest import regression requires the local E2E server.');
  }
  if (process.env.E2E_IDENTITY_SELECTOR !== '1') {
    throw new Error('The guest import regression requires E2E_IDENTITY_SELECTOR=1.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('The guest import regression requires a seeded E2E DATABASE_URL.');
  }
  await page.setViewportSize({ width: 363, height: 1029 });
  await context.addCookies([
    { name: 'NEXT_LOCALE', value: 'en', url: baseURL },
    { name: DEV_IDENTITY_COOKIE, value: GUEST_IDENTITY, url: baseURL },
  ]);
});

for (const identity of [
  { cookie: 'e2e_usr_cocook_000000', initials: 'EC', name: 'co-cook' },
  { cookie: 'unknown-user', initials: 'HC', name: 'unknown-cookie fallback' },
]) {
  test(`guest fixture preserves the authenticated ${identity.name} (#1209)`, async ({
    baseURL,
    context,
    page,
  }) => {
    await context.addCookies([
      { name: DEV_IDENTITY_COOKIE, value: identity.cookie, url: baseURL! },
    ]);
    await page.goto('/recipes/new?flow=full');
    await expect(
      page.locator('header').getByText(identity.initials, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Sign in to import/)).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Recipe URL to import' }).fill(SOURCE_URL);
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeEnabled();
  });
}

test('guest URL and pasted text imports explain sign-in and retain manual drafting (#1209)', async ({
  page,
}) => {
  const actionRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.headers()['next-action']) {
      actionRequests.push(request.url());
    }
  });
  await page.goto('/recipes/new?flow=full');
  const importer = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Import a recipe', exact: true }),
  });
  await expect(importer.getByRole('status')).toContainText('Sign in to import');
  await expect(importer.getByText(/Sign-in is unavailable in this environment/)).toBeVisible();
  const manualTitle = page.getByPlaceholder("e.g. Grandma's Sunday marinara", { exact: true });
  await manualTitle.fill('My unsaved manual draft');
  const link = importer.getByRole('textbox');
  await link.fill(SOURCE_URL);
  await link.press('Enter');
  await expect(importer.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
  await expect(link).toHaveValue(SOURCE_URL);
  await importer.getByRole('tab', { name: 'Paste text', exact: true }).click();
  const text = importer.getByRole('textbox', { name: 'Recipe text to import' });
  await text.fill(SOURCE_TEXT);
  await expect(importer.getByRole('button', { name: 'Use this text' })).toBeDisabled();
  await importer.getByRole('link', { name: 'Write the recipe myself' }).click();
  await expect(page.locator('#editor-basics')).toBeFocused();
  await expect(text).toHaveValue(SOURCE_TEXT);
  await expect(manualTitle).toHaveValue('My unsaved manual draft');
  await manualTitle.fill('Still writing without signing in');
  await expect(
    page.getByText('Something went wrong importing that link.', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Something went wrong reading that text.', { exact: true }),
  ).toHaveCount(0);
  expect(actionRequests).toEqual([]);
  await test.info().attach('bug-1209-guest-source-retained', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('guest shared URL waits without an action or a generic failure (#1209)', async ({ page }) => {
  const actionRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.headers()['next-action']) {
      actionRequests.push(request.url());
    }
  });
  await page.goto(`/recipes/new?import=${encodeURIComponent(SOURCE_URL)}`);
  const importer = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Import a recipe', exact: true }),
  });
  await expect(importer.getByRole('status')).toContainText('Sign in to import');
  await expect(importer.getByRole('textbox')).toHaveValue(SOURCE_URL);
  await expect(importer.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
  await page
    .getByPlaceholder("e.g. Grandma's Sunday marinara", { exact: true })
    .fill('Shared URL manual draft');
  await expect(
    page.getByText('Something went wrong importing that link.', { exact: true }),
  ).toHaveCount(0);
  expect(actionRequests).toEqual([]);
});

test('authenticated imports still parse text and report real URL errors (#1209)', async ({
  page,
  context,
}) => {
  await context.clearCookies({ name: DEV_IDENTITY_COOKIE });
  await page.goto('/recipes/new?flow=full');
  const importer = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Import a recipe', exact: true }),
  });
  await expect(importer.getByText(/Sign in to import/)).toHaveCount(0);
  const source = importer.getByRole('textbox');
  await source.fill('https://localhost/recipe');
  const urlResult = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      Boolean(response.request().headers()['next-action']),
  );
  await importer.getByRole('button', { name: 'Import', exact: true }).click();
  expect((await urlResult).ok()).toBe(true);
  await expect(page.getByText("That address can't be imported.", { exact: true })).toBeVisible();
  await expect(source).toHaveValue('https://localhost/recipe');

  await importer.getByRole('tab', { name: 'Paste text', exact: true }).click();
  await importer.getByRole('textbox', { name: 'Recipe text to import' }).fill(SOURCE_TEXT);
  const textResult = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      Boolean(response.request().headers()['next-action']),
  );
  await importer.getByRole('button', { name: 'Use this text' }).click();
  expect((await textResult).ok()).toBe(true);
  await expect(
    page.getByPlaceholder("e.g. Grandma's Sunday marinara", { exact: true }),
  ).toHaveValue('QA toast');
  await expect(importer.getByRole('textbox', { name: 'Recipe text to import' })).toHaveValue('');
  await expect(
    page.getByPlaceholder('e.g. All-purpose flour', { exact: true }).first(),
  ).toHaveValue('bread');
  await expect(
    page.getByPlaceholder('e.g. Whisk the eggs and sugar until fully incorporated').first(),
  ).toHaveValue('Toast the bread.');
});
