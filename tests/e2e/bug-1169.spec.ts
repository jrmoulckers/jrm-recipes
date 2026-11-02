import { expect, test, type Locator, type Page } from '@playwright/test';

const wholeEggTip = 'About 2½ eggs. Whisk and measure 7½ tbsp (1 egg ≈ 3 tbsp).';

async function expectFractionalIngredients(surface: Page | Locator) {
  for (const item of ['large eggs', 'egg yolks', 'egg whites', 'egg noodles', 'bouillon cubes']) {
    await expect(
      surface.getByRole('button', { name: new RegExp(`^2½\\s*${item}\\b`) }),
    ).toBeVisible();
  }
  await expect(surface.getByRole('button', { name: /^2½\s*eggs, yolks only/ })).toBeVisible();
  await expect(surface.getByText(wholeEggTip, { exact: true })).toHaveCount(1);
  await expect(surface.getByText(/Round (?:up )?to/)).toHaveCount(0);
}

test('bug #1169: detail and cook scaling preserve parts and compounds without whole-egg advice', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/recipes/new');
  await page.getByPlaceholder(/Grandma.*Sunday/i).fill(`E2E scaling advice ${Date.now()}`);
  const items = ['large eggs', 'egg yolks', 'egg whites', 'egg noodles', 'bouillon cubes', 'eggs'];
  for (const [index, item] of items.entries()) {
    if (index > 0) await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
    await page.getByPlaceholder('e.g. All-purpose flour', { exact: true }).nth(index).fill(item);
    await page.getByPlaceholder('e.g. 2 or 1 1/2', { exact: true }).nth(index).fill('2');
  }
  await page
    .getByRole('button', { name: 'More options', exact: true })
    .nth(items.length - 1)
    .click();
  await page.getByPlaceholder('e.g. divided', { exact: true }).fill('yolks only');
  await page.getByPlaceholder(/Whisk the eggs and sugar/).fill('Combine the scaled ingredients.');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/home-cook\/[^/]+$/);
  const recipePath = new URL(page.url()).pathname;

  await page.getByRole('button', { name: 'More servings', exact: true }).click();
  await expectFractionalIngredients(page);
  for (const name of ['Metric', 'US', 'Grams', 'Original']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expectFractionalIngredients(page);
  }
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('button', { name: /^2\s*egg yolks\b/ })).toBeVisible();
  await expect(page.getByText(/Whisk and measure/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Fewer servings', exact: true }).click();
  await expect(page.getByRole('button', { name: /^1½\s*egg yolks\b/ })).toBeVisible();
  await expect(
    page.getByText('About 1½ eggs. Whisk and measure 4½ tbsp (1 egg ≈ 3 tbsp).'),
  ).toHaveCount(1);

  await page.goto(`${recipePath}/cook`);
  await page.getByRole('button', { name: 'More servings', exact: true }).click();
  await expectFractionalIngredients(page);
  await page.getByTestId('cook-mode-start').click();
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Ingredients list and recipe scaling', exact: true })
    .click();
  const drawer = page.getByRole('dialog');
  await expectFractionalIngredients(drawer);
  await drawer.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(drawer.getByRole('button', { name: /^2\s*egg yolks\b/ })).toBeVisible();
  await expect(drawer.getByText(/Whisk and measure/)).toHaveCount(0);
});
