import { expect, test } from '@playwright/test';

import { gotoSeededRecipe } from './recipe-paths';

test('German keepsake and print formats localize generated recipe metadata (#1206)', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(60_000);
  const path = await gotoSeededRecipe(page);
  expect(path, 'The metadata regression requires the seeded recipe').not.toBeNull();
  await context.addCookies([{ name: 'NEXT_LOCALE', value: 'de', url: new URL(page.url()).origin }]);
  await page.setViewportSize({ width: 363, height: 1029 });

  for (const surface of ['keepsake', 'full', 'card3x5'] as const) {
    await page.emulateMedia({ media: 'screen' });
    if (surface === 'keepsake') {
      await page.goto(`${path!}/keepsake?from=Bug%20loop&note=Family%20notes`);
      await expect(
        page.getByRole('button', { name: 'Andenken drucken', exact: true }),
      ).toBeVisible();
    } else {
      await page.goto(`${path!}/print`);
      const format = page.getByRole('button', {
        name: surface === 'full' ? 'Ganze Seite' : '3×5-Karte',
        exact: true,
      });
      await format.click();
      await expect(format).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    const document = page.locator(surface === 'keepsake' ? 'article' : '.heirloom-print-document');
    const meta =
      surface === 'full'
        ? document.locator('dl')
        : document.locator('p').filter({ hasText: /^8 servings ·/ });
    for (const media of ['screen', 'print'] as const) {
      await page.emulateMedia({ media });
      await expect(document).toBeVisible();
      await expect(meta).toContainText('8 servings');
      await expect(meta).toContainText('Gesamt 3 Std. 50 Min.');
      await expect(meta).toContainText('Vorbereitung 20 Min.');
      await expect(meta).toContainText('Garzeit 3 Std. 30 Min.');
      await expect(meta).toContainText('Mittel');
      await expect(meta).toContainText('Italian');
      await expect(document).toContainText("Nonna's Sunday Gravy");
      await expect(meta).not.toContainText(/\b(?:Total|Prep|Cook|Medium)\b/);
      await testInfo.attach(`${surface}-${media}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
  }
});
