import { expect, test } from '@playwright/test';

import { gotoSeededRecipe } from './recipe-paths';

const longUrl = `https://example.com/${'0123456789abcdef'.repeat(4)}`;

for (const message of [
  { name: 'long note URL', from: 'Bug loop', note: `Family notes: ${longUrl}` },
  { name: 'long sender', from: 'W'.repeat(80), note: 'Our family recipe.' },
  { name: 'multiline note', from: 'Family', note: `First line.\n${longUrl}\n\nWith love.` },
  {
    name: 'ordinary multiline note',
    from: 'Family',
    note: 'First line.\nSecond line.\n\nWith love.',
  },
  { name: 'long recipe tokens', from: 'Family', note: 'Our family recipe.', recipeTokens: true },
]) {
  test(`keepsake contains the complete ${message.name} on screen and in print (#1203)`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const path = await gotoSeededRecipe(page);
    expect(path, 'The keepsake regression requires the seeded recipe').not.toBeNull();
    const params = new URLSearchParams({ from: message.from, note: message.note });
    await page.goto(`${path!}/keepsake?${params}`);
    const card = page.getByRole('article');
    await expect(card).toBeVisible();
    const note = card.locator('header p.whitespace-pre-line');
    const sender = card.locator('header p.italic');
    const recipeText = card.locator(
      'h1, :scope > p, section h3, section p, section ul li, section ol li > span:last-child',
    );
    if ('recipeTokens' in message) {
      expect(await recipeText.count()).toBeGreaterThan(3);
      await recipeText.evaluateAll((elements, token) => {
        for (const element of elements) element.textContent = token;
      }, longUrl);
    }

    for (const media of ['screen', 'print'] as const) {
      await page.emulateMedia({ media });
      for (const width of [363, 320, 1280]) {
        await page.setViewportSize({ width, height: 1029 });
        await page.evaluate(() => document.fonts.ready);
        expect(await note.textContent()).toBe(message.note);
        expect(await sender.textContent()).toContain(message.from);
        if ('recipeTokens' in message) {
          for (const text of await recipeText.allTextContents()) expect(text).toBe(longUrl);
        }
        const measurements = await card.evaluate((article) => {
          const bounds = article.getBoundingClientRect();
          const style = getComputedStyle(article);
          const left =
            bounds.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
          const right =
            bounds.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
          const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
          let textInside = true;
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(walker.currentNode);
            textInside &&= [...range.getClientRects()].every(
              (rect) => rect.left >= left - 1 && rect.right <= right + 1,
            );
          }
          const note = article.querySelector('header p.whitespace-pre-line')!;
          return {
            pageOverflow:
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
            cardOverflow: article.scrollWidth - article.clientWidth,
            noteOverflow: note.scrollWidth - note.clientWidth,
            textInside,
            whiteSpace: getComputedStyle(note).whiteSpace,
          };
        });
        const context = `${message.name}, ${media}, ${width}px`;
        expect(measurements.noteOverflow, context).toBeLessThanOrEqual(1);
        expect(measurements.cardOverflow, context).toBeLessThanOrEqual(1);
        expect(measurements.pageOverflow, context).toBeLessThanOrEqual(1);
        expect(measurements.textInside, context).toBe(true);
        expect(measurements.whiteSpace, context).toBe('pre-line');
        await expect(note).toBeVisible();
        await expect(sender).toBeVisible();
      }
    }
  });
}
