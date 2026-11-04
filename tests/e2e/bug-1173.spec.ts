import { expect, test, type Page } from '@playwright/test';

import { gotoSeededRecipe } from './recipe-paths';

const amounts = (page: Page) => page.locator('button[id^="ingredient-"] span.font-semibold');
const servingCount = (page: Page) =>
  page.getByRole('button', { name: 'More servings' }).locator('..').locator('.min-w-24 span');

for (const width of [390, 1194]) {
  for (const entry of ['Cook', 'Cook mode']) {
    test(`${entry} preserves servings and units through Cook and back at ${width}px (#1173)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1030 });
      const path = await gotoSeededRecipe(page);
      expect(path, 'The handoff regression requires the public seeded recipe').not.toBeNull();

      const metric = page.getByRole('button', { name: 'Metric', exact: true });
      await metric.click();
      await expect(metric).toHaveAttribute('aria-pressed', 'true');
      const initialServings = Number(await servingCount(page).textContent());
      expect(initialServings).toBeGreaterThan(0);
      const initialAmounts = await amounts(page).allTextContents();
      expect(initialAmounts.length).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'More servings' }).click();
      await page.getByRole('button', { name: 'More servings' }).click();
      await expect(servingCount(page)).toHaveText(String(initialServings + 2));
      const selectedAmounts = await amounts(page).allTextContents();
      expect(selectedAmounts).not.toEqual(initialAmounts);
      await expect(metric).toHaveAttribute('aria-pressed', 'true');

      await page.getByRole('link', { name: entry, exact: true }).click();
      await expect(page).toHaveURL(`${path}/cook`);
      await expect(page.getByTestId('cook-mode-start')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Metric', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(servingCount(page)).toHaveText(String(initialServings + 2));
      await expect(amounts(page)).toHaveText(selectedAmounts);
      await page.getByTestId('cook-mode-start').click();

      const ingredients = page.getByRole('button', { name: 'Ingredients list and recipe scaling' });
      await ingredients.filter({ visible: true }).first().click();
      await expect(amounts(page)).toHaveText(selectedAmounts);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await ingredients.filter({ visible: true }).first().click();
      await expect(page.getByRole('button', { name: 'Metric', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.getByRole('button', { name: 'More servings' }).click();
      const cookAmounts = await amounts(page).allTextContents();
      await page.keyboard.press('Escape');
      await page.reload();
      await ingredients.filter({ visible: true }).first().click();
      await expect(servingCount(page)).toHaveText(String(initialServings + 3));
      await expect(amounts(page)).toHaveText(cookAmounts);
      await page.keyboard.press('Escape');
      await page.getByRole('link', { name: 'Exit cook mode' }).click();
      await expect(page).toHaveURL(path!);
      await expect(page.getByRole('button', { name: 'Metric', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(servingCount(page)).toHaveText(String(initialServings + 3));
      await expect(amounts(page)).toHaveText(cookAmounts);
      await page.goBack();
      await ingredients.filter({ visible: true }).first().click();
      await expect(amounts(page)).toHaveText(cookAmounts);
    });
  }
}
