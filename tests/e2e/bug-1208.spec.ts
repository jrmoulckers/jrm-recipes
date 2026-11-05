import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 363, height: 1029 } });

for (const dismissal of ['Cancel', 'Close', 'Escape'] as const) {
  test(`Save search restores keyboard focus after ${dismissal} (#1208)`, async ({ page }) => {
    const actionRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.headers()['next-action']) {
        actionRequests.push(request.url());
      }
    });
    await page.goto('/recipes?q=Carbonara');
    const search = page.getByRole('searchbox', { name: 'Search recipes', exact: true });
    await expect(search).toHaveValue('Carbonara');
    const opener = page.getByRole('button', { name: 'Save search', exact: true });
    await expect(opener).toBeEnabled();
    const invokingButton = await opener.elementHandle();
    if (!invokingButton) throw new Error('The Save search opener is missing.');
    const originalUrl = page.url();
    const resultHeadings = await page.getByRole('main').locator('h2, h3').allTextContents();
    expect(resultHeadings.some((heading) => /carbonara/i.test(heading))).toBe(true);

    await opener.focus();
    await expect(opener).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Save this search' });
    await expect(dialog).toBeVisible();
    const name = dialog.getByRole('textbox', { name: 'Name', exact: true });
    await expect(name).toBeFocused();
    await expect(name).toHaveValue('');

    if (dismissal === 'Escape') {
      await page.keyboard.press('Escape');
    } else {
      const dismiss = dialog.getByRole('button', { name: dismissal, exact: true });
      for (let count = 0; count < 4; count += 1) {
        if (await dismiss.evaluate((element) => element === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      await expect(dismiss).toBeFocused();
      await page.keyboard.press('Enter');
    }

    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() => invokingButton.evaluate((element) => element === document.activeElement))
      .toBe(true);
    await expect(opener).toBeEnabled();
    await expect(search).toHaveValue('Carbonara');
    await expect(page).toHaveURL(originalUrl);
    expect(await page.getByRole('main').locator('h2, h3').allTextContents()).toEqual(
      resultHeadings,
    );
    expect(actionRequests).toEqual([]);
  });
}

test('Save search remains disabled without active filters (#1208)', async ({ page }) => {
  await page.goto('/recipes');
  const search = page.getByRole('searchbox', { name: 'Search recipes', exact: true });
  await expect(search).toHaveValue('');
  const opener = page.getByRole('button', { name: 'Save search', exact: true });
  await expect(opener).toBeDisabled();
  await expect(opener).toHaveAttribute('title', 'Add a filter or search term to save');
  await search.focus();
  await page.keyboard.press('Tab');
  await expect(opener).not.toBeFocused();
  await expect(page.getByRole('dialog', { name: 'Save this search' })).toHaveCount(0);
});
