import { expect, test } from '@playwright/test';
import { z } from 'zod';

import de from '../../src/messages/de.json' with { type: 'json' };
import en from '../../src/messages/en.json' with { type: 'json' };
import { gotoSeededRecipe } from './recipe-paths';

test('public embed localizes difficulty while preserving authored content (#1204)', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 363, height: 1029 });
  const recipePath = await gotoSeededRecipe(page);
  expect(recipePath, 'The embed regression requires the seeded public recipe').not.toBeNull();
  const canonicalUrl = new URL(recipePath!, page.url()).href;
  const response = await page.request.get('/api/oembed', { params: { url: canonicalUrl } });
  expect(response.ok()).toBe(true);
  const payload = z
    .object({
      html: z.string().min(1),
      title: z.string().min(1),
      author_name: z.string().min(1),
    })
    .parse(await response.json());
  const iframeSrc = /<iframe src="([^"]+)"/.exec(payload.html)?.[1];
  expect(iframeSrc, 'oEmbed must supply the public ID-based iframe').toBeTruthy();
  const embedPath = new URL(iframeSrc!).pathname;
  expect(embedPath).toMatch(/^\/embed\/recipes\/[^/]+$/);
  expect(embedPath).not.toContain('nonnas-sunday-gravy');

  let description = '';
  let authoredFacts: string[] = [];
  for (const [locale, messages] of [
    ['en', en],
    ['de', de],
  ] as const) {
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: locale, url: new URL(page.url()).origin },
    ]);
    const navigation = await page.goto(embedPath);
    expect(navigation?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(payload.title);
    const link = page.getByRole('main').getByRole('link');
    await expect(link).toHaveAttribute('href', canonicalUrl);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toContainText(messages.embed.viewFullRecipe);
    await expect(link.locator('p').first()).toHaveText(
      messages.embed.byAuthor.replace('{name}', payload.author_name),
    );
    const facts = link.getByRole('listitem');
    await expect(facts).toHaveCount(3);
    await expect(facts.nth(2)).toHaveText(messages.recipeDetail.difficulty.medium);
    if (locale === 'en') {
      description = await link.locator('p').nth(1).innerText();
      authoredFacts = (await facts.allTextContents()).slice(0, 2);
      expect(authoredFacts[1]).toMatch(/^\d+ servings$/);
    } else {
      await expect(link.locator('p').nth(1)).toHaveText(description);
      expect((await facts.allTextContents()).slice(0, 2)).toEqual(authoredFacts);
    }
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
