import { expect, test } from '@playwright/test';

const DEV_IDENTITY_COOKIE = 'heirloom_dev_identity';
const GUEST_IDENTITY = 'e2e_signed_out';

test.beforeEach(async ({ baseURL, context }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('The shopping sign-in regression requires the local E2E server.');
  }
  if (process.env.E2E_IDENTITY_SELECTOR !== '1') {
    throw new Error('The shopping sign-in regression requires E2E_IDENTITY_SELECTOR=1.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('The shopping sign-in regression requires a seeded E2E DATABASE_URL.');
  }
  await context.addCookies([
    { name: 'NEXT_LOCALE', value: 'en', url: baseURL },
    { name: DEV_IDENTITY_COOKIE, value: GUEST_IDENTITY, url: baseURL },
  ]);
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 363, height: 1029 },
]) {
  test(`signed-out shopping gates list creation at ${viewport.width}px (#1201)`, async ({
    page,
    context,
    baseURL,
  }) => {
    await page.setViewportSize(viewport);
    const actionRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.headers()['next-action']) {
        actionRequests.push(request.url());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/shopping');
    const main = page.getByRole('main');
    await expect(
      main.getByRole('heading', { name: 'Sign in to manage shopping lists', exact: true }),
    ).toBeVisible();
    await expect(main.getByRole('status')).toHaveText(
      'Sign in to create shopping lists and save changes to your account.',
    );
    await expect(
      main.getByText(
        'Sign-in is unavailable in this environment. Shopping lists require an account.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(main.getByRole('button', { name: 'New list', exact: true })).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Create list', exact: true })).toHaveCount(0);
    await expect(main.getByText('Something went wrong', { exact: true })).toHaveCount(0);
    expect(actionRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
    await test.info().attach('bug-1201-signed-out-shopping', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await context.addCookies([
      { name: DEV_IDENTITY_COOKIE, value: 'e2e_usr_cocook_000000', url: baseURL! },
    ]);
    await page.reload();
    await expect(main.getByRole('button', { name: 'New list', exact: true })).toBeEnabled();
    await expect(
      main.getByRole('heading', { name: 'Sign in to manage shopping lists', exact: true }),
    ).toHaveCount(0);
    await main.getByRole('button', { name: 'New list', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(actionRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
