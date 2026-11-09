import { expect, test, type Locator } from '@playwright/test';

import { gotoSeededRecipe } from './recipe-paths';

async function settledBounds(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        element.getAnimations().every((animation) => animation.playState === 'finished'),
      ),
    )
    .toBe(true);
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
}

async function expectInsideViewport(locator: Locator) {
  const bounds = await settledBounds(locator);
  expect(bounds.width).toBeGreaterThan(0);
  expect(bounds.height).toBeGreaterThan(0);
  expect(bounds.left).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth + 1);
  expect(bounds.top).toBeGreaterThanOrEqual(-1);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight + 1);
  return bounds;
}

for (const width of [320, 363, 390, 739, 1194, 1280]) {
  for (const direction of ['ltr', 'rtl'] as const) {
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      test(`Cook Ingredients sheet and Close stay in viewport: ${width}px ${direction} ${reducedMotion} (#1212)`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width,
          height: width === 1280 ? 720 : width === 739 ? 1030 : 1029,
        });
        await page.emulateMedia({ reducedMotion });
        const path = await gotoSeededRecipe(page);
        expect(path, 'The geometry regression requires the public seeded recipe').not.toBeNull();
        await page.getByRole('link', { name: 'Cook', exact: true }).click();
        await expect(page).toHaveURL(`${path}/cook`);
        await page.getByTestId('cook-mode-start').click();
        // Isolate layout direction from translated copy so all controls keep stable names.
        await page.locator('html').evaluate((element, dir) => {
          element.setAttribute('dir', dir);
        }, direction);
        const trigger = page
          .locator('footer')
          .getByRole('button', { name: 'Ingredients list and recipe scaling' })
          .filter({ visible: true });
        await expect(trigger).toHaveCount(1);
        await trigger.click();
        const sheet = page.getByRole('dialog', { name: 'Ingredients', exact: true });
        const bounds = await expectInsideViewport(sheet);
        expect(
          Math.abs(direction === 'ltr' ? bounds.right - bounds.viewportWidth : bounds.left),
        ).toBeLessThanOrEqual(1);
        const close = sheet.getByRole('button', { name: 'Close', exact: true });
        await expectInsideViewport(close);
        await expectInsideViewport(sheet.getByRole('button', { name: 'More servings' }));
        const metric = sheet.getByRole('button', { name: 'Metric', exact: true });
        await expectInsideViewport(metric);
        await metric.click();
        await expect(metric).toHaveAttribute('aria-pressed', 'true');
        await close.click();
        await expect(sheet).not.toBeVisible();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await expectInsideViewport(sheet);
        await expect(metric).toHaveAttribute('aria-pressed', 'true');
        await page.keyboard.press('Escape');
        await expect(sheet).not.toBeVisible();
        await expect(trigger).toBeFocused();

        if (width === 739) {
          const headerTrigger = page
            .locator('header')
            .getByRole('button', { name: 'Ingredients list and recipe scaling' })
            .filter({ visible: true });
          await expect(headerTrigger).toHaveCount(1);
          await headerTrigger.click();
          const headerBounds = await expectInsideViewport(sheet);
          expect(
            Math.abs(
              direction === 'ltr'
                ? headerBounds.right - headerBounds.viewportWidth
                : headerBounds.left,
            ),
          ).toBeLessThanOrEqual(1);
          await expectInsideViewport(close);
          await close.click();
          await expect(sheet).not.toBeVisible();
          await expect(headerTrigger).toBeFocused();
        }

        if (width >= 1194) {
          const overviewTrigger = page.getByRole('button', { name: 'Overview', exact: true });
          await overviewTrigger.click();
          const overview = page.getByRole('dialog', { name: 'Recipe overview' });
          const centered = await expectInsideViewport(overview);
          expect(
            Math.abs(centered.left + centered.width / 2 - centered.viewportWidth / 2),
          ).toBeLessThanOrEqual(1);
          expect(
            Math.abs(centered.top + centered.height / 2 - centered.viewportHeight / 2),
          ).toBeLessThanOrEqual(1);
          await overview.getByRole('button', { name: 'Close', exact: true }).click();
          await expect(overviewTrigger).toBeFocused();
        }
      });
    }
  }
}
