import { LOCALE_COOKIE, resolveLocale, type Locale } from "~/config/i18n";

/** One year, in seconds — how long a chosen locale persists. */
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Parse a raw `document.cookie` string and resolve the persisted locale.
 *
 * Kept pure (takes the cookie string rather than touching `document`) so it can
 * be unit tested and reused on the server. Splits on `; ` with optional space so
 * it tolerates both browser-serialized and hand-built cookie strings, and runs
 * the value through {@link resolveLocale} so anything unknown falls back to the
 * default locale instead of poisoning the UI.
 */
export function readLocaleCookie(cookieString: string): Locale {
  const prefix = `${LOCALE_COOKIE}=`;
  for (const part of cookieString.split(/; */)) {
    if (part.startsWith(prefix)) {
      return resolveLocale(decodeURIComponent(part.slice(prefix.length)));
    }
  }
  return resolveLocale(null);
}

/**
 * Persist the chosen locale in the `NEXT_LOCALE` cookie so the server can render
 * the right language on the next paint. Mirrors the theme cookie's attributes
 * (`path=/`, one-year max-age, `SameSite=Lax`) for a consistent, no-flash UX.
 */
export function writeLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(
    locale,
  )};path=/;max-age=${ONE_YEAR};samesite=lax`;
}
