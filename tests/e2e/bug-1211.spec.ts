import { expect, test } from '@playwright/test';

import ar from '../../src/messages/ar.json' with { type: 'json' };
import de from '../../src/messages/de.json' with { type: 'json' };
import en from '../../src/messages/en.json' with { type: 'json' };
import es from '../../src/messages/es.json' with { type: 'json' };
import { recipeSortValues } from '../../src/server/recipes/search';

for (const [locale, catalog] of Object.entries({ en, es, de, ar })) {
  test(`bug #1211: ${locale} quick picks and sort menu preserve canonical search behavior`, async ({
    page,
    context,
    baseURL,
  }) => {
    if (!baseURL) throw new Error('The search regression requires the local E2E server.');
    await page.setViewportSize({ width: 363, height: 1029 });
    await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL }]);
    await page.goto('/recipes');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    const messages = catalog.recipeSearch;
    const quickPicks = page.getByRole('group', { name: messages.quickFiltersAria, exact: true });
    for (const preset of Object.values(messages.presets)) {
      await expect(
        quickPicks.getByRole('button', { name: preset.label, exact: true }),
      ).toHaveAttribute('title', preset.description);
    }

    const sort = page.getByRole('combobox', { name: messages.field.sort, exact: true });
    await expect(sort).toHaveText(messages.sortOptions.newest);
    const weeknight = quickPicks.getByRole('button', {
      name: messages.presets.weeknight.label,
      exact: true,
    });
    await weeknight.click();
    await expect(page).toHaveURL((url) => {
      return (
        url.searchParams.get('maxTime') === '30' &&
        url.searchParams.get('difficulty') === 'easy' &&
        url.searchParams.get('sort') === 'quickest'
      );
    });
    await expect(weeknight).toHaveAttribute('aria-pressed', 'true');
    await expect(sort).toHaveText(messages.sortOptions.quickest);
    await sort.click();
    await page
      .getByRole('option', { name: messages.sortOptions['top-rated'], exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('maxTime') === '30' &&
        url.searchParams.get('difficulty') === 'easy' &&
        url.searchParams.get('sort') === 'top-rated',
    );
    await expect(weeknight).toHaveAttribute('aria-pressed', 'false');
    await expect(sort).toHaveText(messages.sortOptions['top-rated']);
    await weeknight.click();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('maxTime') === '30' &&
        url.searchParams.get('difficulty') === 'easy' &&
        url.searchParams.get('sort') === 'quickest',
    );
    await expect(weeknight).toHaveAttribute('aria-pressed', 'true');
    await expect(sort).toHaveText(messages.sortOptions.quickest);
    await weeknight.click();
    await expect(page).toHaveURL((url) => url.pathname === '/recipes' && url.search === '');
    await expect(weeknight).toHaveAttribute('aria-pressed', 'false');
    await expect(sort).toHaveText(messages.sortOptions.newest);

    const quick15 = quickPicks.getByRole('button', {
      name: messages.presets['quick-15'].label,
      exact: true,
    });
    await quick15.click();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('maxTime') === '15' &&
        url.searchParams.get('sort') === 'quickest' &&
        !url.searchParams.has('difficulty'),
    );
    await expect(quick15).toHaveAttribute('aria-pressed', 'true');
    await quick15.click();
    await expect(page).toHaveURL((url) => url.pathname === '/recipes' && url.search === '');
    await expect(quick15).toHaveAttribute('aria-pressed', 'false');

    const kidFriendly = quickPicks.getByRole('button', {
      name: messages.presets['kid-friendly'].label,
      exact: true,
    });
    await kidFriendly.click();
    await expect(page).toHaveURL((url) => url.searchParams.get('tag') === 'kid-friendly');
    await expect(kidFriendly).toHaveAttribute('aria-pressed', 'true');
    for (const value of recipeSortValues) {
      await sort.click();
      await expect(page.getByRole('option')).toHaveCount(recipeSortValues.length);
      for (const option of recipeSortValues) {
        await expect(
          page.getByRole('option', { name: messages.sortOptions[option], exact: true }),
        ).toBeVisible();
      }
      await page.getByRole('option', { name: messages.sortOptions[value], exact: true }).click();
      await expect(page).toHaveURL(
        (url) =>
          url.searchParams.get('tag') === 'kid-friendly' &&
          url.searchParams.get('sort') === (value === 'newest' ? null : value),
      );
      await expect(sort).toHaveText(messages.sortOptions[value]);
    }
    await page.reload();
    await expect(sort).toHaveText(messages.sortOptions['calories-low']);
    await expect(kidFriendly).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await test.info().attach(`bug-1211-${locale}-search-controls`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
}
