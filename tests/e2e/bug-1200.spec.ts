import { createId } from '@paralleldrive/cuid2';
import { expect, test } from '@playwright/test';
import postgres from 'postgres';

import ar from '../../src/messages/ar.json' with { type: 'json' };
import de from '../../src/messages/de.json' with { type: 'json' };
import en from '../../src/messages/en.json' with { type: 'json' };
import es from '../../src/messages/es.json' with { type: 'json' };

const catalogs = { en, es, de, ar };
const DEV_IDENTITY_COOKIE = 'heirloom_dev_identity';
const GUEST_IDENTITY = 'e2e_signed_out';
const CO_COOK_ID = 'e2e_usr_cocook_000000';

test.beforeEach(async ({ baseURL, context }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('The signed-out Journal regression requires the local E2E server.');
  }
  if (process.env.E2E_IDENTITY_SELECTOR !== '1') {
    throw new Error('The signed-out Journal regression requires E2E_IDENTITY_SELECTOR=1.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('The signed-out Journal regression requires a seeded E2E DATABASE_URL.');
  }
  await context.addCookies([{ name: DEV_IDENTITY_COOKIE, value: GUEST_IDENTITY, url: baseURL }]);
});

test('authenticated Journal preserves first-cook, history and filtered-empty states (#1200)', async ({
  baseURL,
  context,
  page,
}) => {
  await context.addCookies([
    { name: DEV_IDENTITY_COOKIE, value: CO_COOK_ID, url: baseURL! },
    { name: 'NEXT_LOCALE', value: 'en', url: baseURL! },
  ]);
  const journal = page.locator('main');
  const copy = en.cookLog.journal;
  await page.goto('/journal');
  await expect(journal.getByRole('heading', { name: copy.empty.title })).toBeVisible();
  await expect(journal.getByRole('link', { name: copy.empty.cta })).toBeVisible();
  await expect(journal.getByText(copy.signedOut.title, { exact: true })).toHaveCount(0);

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const cookId = createId();
  const note = `Journal preservation ${cookId}`;
  try {
    await sql`
        insert into cook_log_entries (id, recipe_id, user_id, cooked_at, note, servings_made)
        values (${cookId}, 'seed_rcp_gravy', ${CO_COOK_ID}, '2020-01-01T12:00:00Z', ${note}, 2)
      `;
    await page.goto('/journal');
    await expect(journal.getByText(note, { exact: true })).toBeVisible();
    await expect(journal.getByText(copy.nutritionTitle, { exact: true })).toBeVisible();
    await expect(journal.getByRole('combobox')).toHaveCount(2);
    await expect(journal.getByText(copy.empty.title, { exact: true })).toHaveCount(0);
    await expect(journal.getByText(copy.signedOut.title, { exact: true })).toHaveCount(0);

    await page.goto('/journal?range=month');
    await expect(journal.getByText(copy.noMatches.title, { exact: true })).toBeVisible();
    await expect(journal.getByText(copy.noMatches.withFilters, { exact: true })).toBeVisible();
    await expect(journal.getByRole('combobox')).toHaveCount(2);
    await expect(journal.getByText(note, { exact: true })).toHaveCount(0);
    await expect(journal.getByText(copy.empty.title, { exact: true })).toHaveCount(0);
    await expect(journal.getByText(copy.signedOut.title, { exact: true })).toHaveCount(0);
  } finally {
    await sql`delete from cook_log_entries where id = ${cookId} and user_id = ${CO_COOK_ID}`;
    await sql.end();
  }
});
// The bypass fixture has no real Clerk provider; modal behavior needs separate live proof.
for (const locale of ['en', 'es', 'de', 'ar'] as const) {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 363, height: 1029 },
  ]) {
    test(`signed-out Journal explains account history in ${locale} at ${viewport.width}px (#1200)`, async ({
      baseURL,
      context,
      page,
    }) => {
      await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL! }]);
      await page.setViewportSize(viewport);
      await page.goto('/journal?range=month');
      const journal = page.locator('main');
      const copy = catalogs[locale].cookLog.journal;
      await expect(journal.getByRole('heading', { name: copy.signedOut.title })).toBeVisible();
      await expect(journal.getByText(copy.signedOut.body)).toBeVisible();
      await expect(journal.getByText(copy.signedOut.unavailable)).toBeVisible();
      await expect(journal.getByRole('button', { name: copy.signedOut.cta })).toHaveCount(0);
      await expect(journal.getByText(copy.empty.title, { exact: true })).toHaveCount(0);
      await expect(journal.getByRole('link', { name: copy.empty.cta })).toHaveCount(0);
      await expect(journal.getByRole('combobox')).toHaveCount(0);
      await expect(journal.getByText(copy.nutritionTitle, { exact: true })).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await test.info().attach(`bug-1200-${locale}-${viewport.width}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    });
  }
}
