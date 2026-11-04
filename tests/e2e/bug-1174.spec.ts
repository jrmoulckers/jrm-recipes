import { expect, test } from '@playwright/test';

import { gotoSeededRecipe } from './recipe-paths';

test('print attribution stays inside the sheet and clear of its QR (#1174)', async ({ page }) => {
  test.setTimeout(60_000);
  const path = await gotoSeededRecipe(page);
  expect(path, 'The print layout regression requires the seeded recipe').not.toBeNull();
  await page.goto(`${path!}/print`);

  for (const format of ['Full page', 'Two-column', '4×6 card', '3×5 card']) {
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 1194, height: 1030 });
    await page.getByRole('button', { name: format, exact: true }).click();
    const footer = page.locator('.heirloom-print-document footer');
    await expect(footer).toBeVisible();
    const originalText = await footer.locator(':scope > :first-child').textContent();
    const originalHtml = await footer.locator(':scope > :first-child').innerHTML();

    for (const large of [false, true]) {
      const largeButton = page.getByRole('button', { name: 'Large print', exact: true });
      if ((await largeButton.getAttribute('aria-pressed')) !== String(large)) {
        await largeButton.click();
      }
      for (const media of ['screen', 'print'] as const) {
        const width =
          media === 'screen'
            ? 1194
            : format === '3×5 card'
              ? 261
              : format === '4×6 card'
                ? 349
                : 710;
        await page.setViewportSize({ width, height: 1030 });
        await page.emulateMedia({ media });
        for (const longToken of [false, true]) {
          const suffix = longToken ? ` https://example.com/${'long-url'.repeat(40)}` : '';
          await footer.locator(':scope > :first-child').evaluate(
            (element, { html, suffix }) => {
              element.innerHTML = html;
              element.append(document.createTextNode(suffix));
            },
            { html: originalHtml, suffix },
          );
          const measurements = await footer.evaluate((element) => {
            const attribution = element.firstElementChild!;
            const bounds = attribution.getBoundingClientRect();
            const qr = element.querySelector('svg')!.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(attribution);
            return {
              overflow: element.scrollWidth - element.clientWidth,
              wrap: getComputedStyle(attribution).overflowWrap,
              qrWidth: qr.width,
              textInside: [...range.getClientRects()].every(
                (rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1,
              ),
              separate:
                bounds.right <= qr.left || bounds.bottom <= qr.top || bounds.top >= qr.bottom,
            };
          });
          const context = `${format}, large=${large}, ${media}, long=${longToken}`;
          expect(measurements.overflow, context).toBeLessThanOrEqual(1);
          expect(measurements.textInside, context).toBe(true);
          expect(measurements.separate, context).toBe(true);
          expect(measurements.wrap, context).toBe('anywhere');
          expect(measurements.qrWidth, context).toBe(format.includes('card') ? 64 : 84);
          await expect(footer.locator(':scope > :first-child')).toHaveText(
            `${originalText}${suffix}`,
          );
        }
      }
      await footer.locator(':scope > :first-child').evaluate((element, html) => {
        element.innerHTML = html;
      }, originalHtml);
      await page.emulateMedia({ media: 'screen' });
      await page.setViewportSize({ width: 1194, height: 1030 });
    }
  }
});
