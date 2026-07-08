/**
 * Internationalization config — the single source of truth for the app's
 * supported locales, the active default, and each locale's writing direction.
 *
 * Locale resolution is cookie/`Accept-Language`-driven at the edge of the i18n
 * runtime (`src/i18n/request.ts`); this module stays framework-free so it can be
 * imported from the layout, server helpers, formatters, and unit tests alike.
 * It mirrors the shape/conventions of `src/config/themes.ts`.
 */

/** Writing direction for the document root. */
export type Direction = "ltr" | "rtl";

/**
 * Primary language subtags that are written right-to-left. Direction is a
 * property of the language (and occasionally its script), so we key off the
 * primary subtag of a BCP-47 tag (e.g. the `ar` in `ar-EG`). Legacy ISO 639
 * codes browsers may still emit (`iw`, `ji`) are included for safety.
 */
const RTL_LANGUAGES: ReadonlySet<string> = new Set([
  "ar", // Arabic
  "arc", // Aramaic
  "ckb", // Central Kurdish (Sorani)
  "dv", // Divehi / Maldivian
  "fa", // Persian / Farsi
  "he", // Hebrew
  "iw", // Hebrew (legacy code)
  "ji", // Yiddish (legacy code)
  "ks", // Kashmiri
  "ps", // Pashto
  "sd", // Sindhi
  "ug", // Uyghur
  "ur", // Urdu
  "yi", // Yiddish
]);

/**
 * The locales the app ships message catalogs for. Each id has a matching
 * `src/messages/<id>.json`. English is first and is the default so existing
 * English pages, copy, and snapshot tests never regress.
 */
export const SUPPORTED_LOCALES = ["en", "es", "de", "ar"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** The locale served when nothing else is negotiated. */
export const DEFAULT_LOCALE: Locale = "en";

/**
 * Cookie that persists a visitor's chosen locale across reloads. `NEXT_LOCALE`
 * is the community/next-intl convention, and it lets the server render the
 * correct language on first paint (no flash), the same way theme/a11y cookies
 * do in `layout.tsx`.
 */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Native language names (endonyms) for the locale switcher — a language menu
 * should read in each language's own script, not the current UI language.
 */
export const LOCALE_ENDONYMS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch",
  ar: "العربية",
};

/**
 * OpenGraph `og:locale` values (BCP-47 with an underscore territory) for each
 * supported locale. Crawlers/social cards expect the `language_TERRITORY` form
 * rather than the bare language subtag the app routes on.
 */
export const OPEN_GRAPH_LOCALES: Record<Locale, string> = {
  en: "en_US",
  es: "es_ES",
  de: "de_DE",
  ar: "ar_AR",
};

/**
 * Map a requested locale to its OpenGraph locale string, falling back to the
 * default locale's value for anything unsupported.
 */
export function openGraphLocale(requested?: string | null): string {
  return OPEN_GRAPH_LOCALES[resolveLocale(requested)];
}

/** True when `value` is one of the supported locales. */
export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Resolve a requested locale (from a cookie, param, or header) to a supported
 * one, falling back to {@link DEFAULT_LOCALE}. Called with no argument it simply
 * returns the default, so callers without negotiation still get a safe value.
 */
export function resolveLocale(requested?: string | null): Locale {
  return isLocale(requested) ? requested : DEFAULT_LOCALE;
}

/**
 * Map a BCP-47 locale (or bare language code) to its writing direction.
 * Unknown or empty locales fall back to `ltr`, the safe default for the Latin
 * script the app ships with.
 */
export function localeDirection(locale: string): Direction {
  const primary = locale.toLowerCase().split(/[-_]/)[0] ?? "";
  return RTL_LANGUAGES.has(primary) ? "rtl" : "ltr";
}
