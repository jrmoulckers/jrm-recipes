import { expect, test } from '@playwright/test';

import { gotoSeededRecipe } from './recipe-paths';

test.use({ viewport: { width: 1194, height: 1030 } });

test('bug #1178: invalid piece-count drafts hide the target and explain how to recover', async ({
  page,
}) => {
  const path = await gotoSeededRecipe(page);
  expect(path, 'This regression requires the CI-seeded recipe').not.toBeNull();
  const count = page.getByRole('spinbutton', { name: 'Number of pieces' });
  const batch = count.locator('../..');
  const target = batch.getByText(/= .+ each/);
  const feedback = batch.getByText('Enter a whole number of pieces, at least 1.', { exact: true });
  const defaultTarget = await target.innerText();
  const batchText = await batch.locator('span').first().innerText();

  await count.fill('8');
  await expect(target).toHaveText(defaultTarget);
  await expect(count).not.toHaveAttribute('aria-invalid', 'true');

  for (const draft of ['1.5', '0', '-2']) {
    await count.fill(draft);
    await expect(count).toHaveValue(draft);
    await expect(target, `Invalid piece-count draft ${draft} must suppress the target`).toHaveCount(
      0,
    );
    await expect(count).toHaveAttribute('aria-invalid', 'true');
    await expect(count).toHaveAccessibleDescription('Enter a whole number of pieces, at least 1.');
    await expect(feedback).toBeVisible();
    await expect(batch.getByText(batchText, { exact: true })).toBeVisible();
    expect(await count.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);

    for (const name of ['Metric', 'US', 'Original']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(count).toHaveValue(draft);
      await expect(target).toHaveCount(0);
      await expect(feedback).toBeVisible();
    }

    await count.fill('8');
    await expect(target).toHaveText(defaultTarget);
    await expect(count).not.toHaveAttribute('aria-invalid', 'true');
    await expect(count).not.toHaveAttribute('aria-describedby');
    await expect(feedback).toHaveCount(0);
  }

  await count.fill('');
  await expect(target).toHaveText(defaultTarget);
  await count.pressSequentially('e');
  expect(await count.evaluate((input: HTMLInputElement) => input.validity.badInput)).toBe(true);
  await expect(target).toHaveCount(0);
  await expect(count).toHaveAttribute('aria-invalid', 'true');
  await expect(count).toHaveAccessibleDescription('Enter a whole number of pieces, at least 1.');
  await expect(feedback).toBeVisible();
  await page.getByRole('button', { name: 'Metric', exact: true }).click();
  expect(await count.evaluate((input: HTMLInputElement) => input.validity.badInput)).toBe(true);
  await expect(target).toHaveCount(0);
  await expect(feedback).toBeVisible();

  await count.focus();
  await count.press('ControlOrMeta+A');
  await count.press('Backspace');
  await expect(target).toHaveText(defaultTarget);
  await expect(count).not.toHaveAttribute('aria-invalid', 'true');
  await expect(count).not.toHaveAttribute('aria-describedby');

  await count.pressSequentially('3');
  await expect(target).toBeVisible();
  await expect(target).not.toHaveText(defaultTarget);
  await expect(count).not.toHaveAttribute('aria-invalid', 'true');
  expect(await count.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
});
