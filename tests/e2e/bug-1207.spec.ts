import { expect, test } from '@playwright/test';

const longDescription =
  'Family notes: https://example.com/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ordinaryDescription = 'A familiar family soup, served with bread.\nKeep the family notes.';

for (const width of [320, 363, 1280]) {
  test(`preview wraps descriptions and preserves Edit recovery at ${width}px (#1207)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1029 });
    await page.goto('/recipes/new?flow=full');
    const description = page.getByLabel('Description', { exact: true });
    await expect(description).toBeVisible();

    for (const text of [ordinaryDescription, longDescription]) {
      await description.fill(text);
      const previewButton = page.getByRole('button', { name: 'Preview', exact: true });
      await previewButton.focus();
      await previewButton.press('Enter');
      await expect(previewButton).toHaveAttribute('data-state', 'on');
      const paragraph = page.locator('form header p').filter({ hasText: text });
      await expect(paragraph).toBeVisible();
      expect(await paragraph.textContent()).toBe(text);
      const geometry = await paragraph.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const textRects = [...range.getClientRects()];
        return {
          documentOverflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          textOverflow: element.scrollWidth - element.clientWidth,
          width: bounds.width,
          textRectCount: textRects.length,
          insideViewport: bounds.left >= 0 && bounds.right <= window.innerWidth,
          textInside: textRects.every(
            (rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1,
          ),
        };
      });
      expect(geometry.width).toBeGreaterThan(0);
      expect(geometry.textRectCount).toBeGreaterThan(0);
      expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
      expect(geometry.textOverflow).toBeLessThanOrEqual(1);
      expect(geometry.insideViewport).toBe(true);
      expect(geometry.textInside).toBe(true);

      const editButton = page.getByRole('button', { name: 'Edit', exact: true });
      await editButton.focus();
      await editButton.press('Enter');
      await expect(editButton).toHaveAttribute('data-state', 'on');
      await expect(description).toBeVisible();
      await expect(description).toHaveValue(text);
      await expect(page.getByRole('button', { name: 'Save recipe', exact: true })).toBeEnabled();
      await expect(page).toHaveURL(/\/recipes\/new\?flow=full$/);
    }
  });
}
