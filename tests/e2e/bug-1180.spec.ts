import { expect, test, type Locator, type Page } from '@playwright/test';

const boundsMessage =
  'This target needs fewer than 1 or more than 1000 servings. Change the amount to stay within that range.';

async function checkTargetBounds(surface: Page | Locator) {
  const original = surface
    .getByRole('group', { name: 'Measurement system', exact: true })
    .getByRole('button', { name: 'Original', exact: true });
  await original.click();
  await expect(original).toHaveAttribute('aria-pressed', 'true');
  await expect(surface.getByRole('button', { name: /^400\s*g\s*spaghetti\b/ })).toBeVisible();
  await surface.getByRole('button', { name: 'Scale to…', exact: true }).click();
  const amount = surface.getByRole('spinbutton', { name: 'Target amount', exact: true });
  const apply = surface.getByRole('button', { name: 'Apply', exact: true });
  for (const target of ['50', '99.999', '100000.001']) {
    await amount.fill(target);
    await expect(apply).toBeDisabled();
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
    await expect(amount).toHaveAccessibleDescription(boundsMessage);
    await amount.press('Enter');
    await expect(amount).toHaveValue(target);
    await expect(surface.getByRole('button', { name: /^400\s*g\s*spaghetti\b/ })).toBeVisible();
  }
  await amount.fill('150');
  await expect(apply).toBeEnabled();
  await expect(amount).not.toHaveAttribute('aria-invalid', 'true');
  await expect(surface.getByText('≈ ⅜× the recipe, 1½ servings', { exact: true })).toBeVisible();
  await apply.press('Enter');
  await expect(amount).toHaveCount(0);
  await expect(surface.getByRole('button', { name: /^150\s*g\s*spaghetti\b/ })).toBeVisible();

  await surface.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(surface.getByRole('button', { name: /^400\s*g\s*spaghetti\b/ })).toBeVisible();
}

test('bug #1180: detail and Cook reject unsupported targets and honor valid fractional targets', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/recipes/new');
  await page.getByPlaceholder(/Grandma.*Sunday/i).fill(`E2E target bounds ${Date.now()}`);
  await page.getByPlaceholder('e.g. All-purpose flour', { exact: true }).fill('spaghetti');
  await page.getByPlaceholder('e.g. 2 or 1 1/2', { exact: true }).fill('400');
  await page.getByPlaceholder('e.g. cups', { exact: true }).fill('g');
  await page.getByPlaceholder(/Whisk the eggs and sugar/).fill('Cook the spaghetti.');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/home-cook\/[^/]+$/);
  const recipePath = new URL(page.url()).pathname;
  await checkTargetBounds(page);

  await page.goto(`${recipePath}/cook`);
  await checkTargetBounds(page);
  await page.getByTestId('cook-mode-start').click();
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Ingredients list and recipe scaling', exact: true })
    .click();
  await checkTargetBounds(page.getByRole('dialog'));
});
