import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { LocaleSwitcher } from './locale-switcher';
import { LOCALE_ENDONYMS, SUPPORTED_LOCALES, type Locale } from '~/config/i18n';
import { readLocaleCookie } from '~/lib/locale-cookie';
import { IntlWrapper } from '~/test/intl';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

// Radix DropdownMenu leans on browser APIs jsdom lacks.
beforeAll(() => {
  const proto = window.HTMLElement.prototype;
  proto.scrollIntoView = vi.fn();
  proto.hasPointerCapture = vi.fn(() => false);
  proto.setPointerCapture = vi.fn();
  proto.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
  document.cookie = 'NEXT_LOCALE=;path=/;max-age=0';
});

function render(locale: Locale = 'en') {
  return rtlRender(
    <IntlWrapper locale={locale}>
      <LocaleSwitcher />
    </IntlWrapper>,
  );
}

async function openMenu() {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await user.click(screen.getByRole('button', { name: 'Change language' }));
  return user;
}

describe('LocaleSwitcher', () => {
  it('lists every supported locale by its native endonym, English checked', async () => {
    render();
    await openMenu();

    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    for (const endonym of ['Español', 'Deutsch', 'العربية']) {
      expect(screen.getByRole('menuitemradio', { name: endonym })).toHaveAttribute(
        'aria-checked',
        'false',
      );
    }
  });

  it.each(SUPPORTED_LOCALES)('persists exactly %s and refreshes once', async (locale) => {
    const initialLocale = locale === 'en' ? 'es' : 'en';
    document.cookie = `NEXT_LOCALE=${initialLocale}; Path=/`;
    render(initialLocale);
    const user = await openMenu();

    await user.click(screen.getByRole('menuitemradio', { name: LOCALE_ENDONYMS[locale] }));

    expect(document.cookie.split(/; */).find((part) => part.startsWith('NEXT_LOCALE='))).toBe(
      `NEXT_LOCALE=${locale}`,
    );
    expect(readLocaleCookie(document.cookie)).toBe(locale);
    expect(refresh).toHaveBeenCalledExactlyOnceWith();
  });

  it('does not rewrite the cookie or refresh when choosing the active locale', async () => {
    document.cookie = 'NEXT_LOCALE=en; Path=/';
    const setter = vi.spyOn(document, 'cookie', 'set');
    render();
    const user = await openMenu();

    await user.click(screen.getByRole('menuitemradio', { name: 'English' }));

    expect(document.cookie).toBe('NEXT_LOCALE=en');
    expect(setter).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
