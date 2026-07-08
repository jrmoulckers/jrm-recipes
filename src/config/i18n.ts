/**
 * Internationalization config — the single source of truth for the app's
 * active locale and its writing direction.
 *
 * Heirloom does not (yet) do per-request locale negotiation, so the "active"
 * locale is simply the one configured in `brand`. Centralizing it here means
 * `layout.tsx` renders `<html lang dir>` from a resolved value instead of a
 * hardcoded constant, and gives one place to grow real locale resolution
 * (cookie / Accept-Language) later without touching the layout again.
 */

import { brand } from "~/config/brand";

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

/** The locale the app currently serves, per the brand configuration. */
export const DEFAULT_LOCALE: string = brand.locale;

/**
 * Resolve the active locale for the current render. Today this is always the
 * configured default; the seam exists so future locale negotiation can slot in
 * without changing every caller.
 */
export function resolveLocale(): string {
  return DEFAULT_LOCALE;
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
