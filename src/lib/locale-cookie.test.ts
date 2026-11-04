import { afterEach, describe, expect, it, vi } from 'vitest';

import { readLocaleCookie, writeLocaleCookie } from './locale-cookie';
import { SUPPORTED_LOCALES } from '~/config/i18n';

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = 'NEXT_LOCALE=; Path=/; Max-age=0';
});

describe('writeLocaleCookie', () => {
  it.each(SUPPORTED_LOCALES)('round-trips %s with separate persistence attributes', (locale) => {
    const setter = vi.spyOn(document, 'cookie', 'set');

    writeLocaleCookie(locale);

    expect(setter).toHaveBeenCalledExactlyOnceWith(
      `NEXT_LOCALE=${locale}; Path=/; Max-age=31536000; Samesite=lax`,
    );
    expect(document.cookie.split(/; */).find((part) => part.startsWith('NEXT_LOCALE='))).toBe(
      `NEXT_LOCALE=${locale}`,
    );
    expect(readLocaleCookie(document.cookie)).toBe(locale);
  });
});

describe('readLocaleCookie', () => {
  it('returns the default locale when the cookie is absent', () => {
    expect(readLocaleCookie('')).toBe('en');
    expect(readLocaleCookie('theme=warm; a11y=1')).toBe('en');
  });

  it('reads a supported locale from the cookie', () => {
    expect(readLocaleCookie('NEXT_LOCALE=es')).toBe('es');
    expect(readLocaleCookie('NEXT_LOCALE=ar')).toBe('ar');
  });

  it('finds the cookie among others regardless of spacing', () => {
    expect(readLocaleCookie('theme=warm; NEXT_LOCALE=de')).toBe('de');
    expect(readLocaleCookie('theme=warm;NEXT_LOCALE=de')).toBe('de');
    expect(readLocaleCookie('NEXT_LOCALE=de; scheme=dark')).toBe('de');
  });

  it('falls back to the default for an unsupported value', () => {
    expect(readLocaleCookie('NEXT_LOCALE=fr')).toBe('en');
    expect(readLocaleCookie('NEXT_LOCALE=')).toBe('en');
  });

  it('decodes URL-encoded values', () => {
    expect(readLocaleCookie('NEXT_LOCALE=%65%73')).toBe('es');
  });
});
