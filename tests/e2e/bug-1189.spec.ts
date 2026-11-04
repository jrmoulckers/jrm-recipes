import { expect, test } from '@playwright/test';

import { LOCALE_ENDONYMS, type Locale } from '../../src/config/i18n';
import ar from '../../src/messages/ar.json' with { type: 'json' };
import de from '../../src/messages/de.json' with { type: 'json' };
import en from '../../src/messages/en.json' with { type: 'json' };
import es from '../../src/messages/es.json' with { type: 'json' };

const messages = { en, es, de, ar };

test('profile language menu persists every locale across reloads (#1189)', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1194, height: 1030 });
  await page.goto('/profile');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  let currentLocale: Locale = 'en';

  for (const locale of ['de', 'es', 'ar', 'en'] as const) {
    await page
      .getByRole('button', {
        name: messages[currentLocale].profile.preferences.language,
        exact: true,
      })
      .click();
    const writtenAt = Date.now() / 1000;
    await page.getByRole('menuitemradio', { name: LOCALE_ENDONYMS[locale], exact: true }).click();

    const localeCookies = (await context.cookies()).filter(
      (cookie) => cookie.name === 'NEXT_LOCALE',
    );
    expect(localeCookies).toHaveLength(1);
    const cookie = localeCookies[0]!;
    expect(cookie.value).toBe(locale);
    expect(cookie.path).toBe('/');
    expect(cookie.sameSite).toBe('Lax');
    expect(cookie.expires).toBeGreaterThan(writtenAt + 31536000 - 5);
    expect(cookie.expires).toBeLessThan(Date.now() / 1000 + 31536000 + 5);

    const direction = locale === 'ar' ? 'rtl' : 'ltr';
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', direction);
    await page.keyboard.press('Escape');

    const response = await page.reload();
    expect(response?.ok()).toBe(true);
    const html = await response!.text();
    expect(html).toMatch(new RegExp(`<html[^>]*lang="${locale}"`));
    expect(html).toMatch(new RegExp(`<html[^>]*dir="${direction}"`));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', direction);
    await expect(page).toHaveTitle(`${messages[locale].profile.title} · Heirloom`);
    await expect(
      page.getByRole('heading', { name: messages[locale].profile.preferences.title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: messages[locale].profile.preferences.language, exact: true })
      .click();
    await expect(
      page.getByRole('menuitemradio', { name: LOCALE_ENDONYMS[locale], exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    currentLocale = locale;
  }
});
