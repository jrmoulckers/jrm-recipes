import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { LOCALE_COOKIE, resolveLocale } from "~/config/i18n";
import en from "../messages/en.json";
import es from "../messages/es.json";
import de from "../messages/de.json";
import ar from "../messages/ar.json";

/**
 * Message catalogs keyed by locale. Imported statically so the active catalog is
 * selected without an untyped dynamic import; they only ever load on the server
 * (this config runs per request in RSC), so no catalog ships to the client.
 */
const CATALOGS = { en, es, de, ar };

/**
 * next-intl request configuration. Heirloom resolves the active locale from the
 * `NEXT_LOCALE` cookie (set by the locale switcher) rather than a URL prefix,
 * falling back to the default locale. This keeps the App Router + RSC setup
 * lightweight and lets the server render the right language on first paint.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);

  return { locale, messages: CATALOGS[locale] };
});
