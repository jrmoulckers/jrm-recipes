import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

import { LOCALE_COOKIE, resolveRequestLocale } from "~/config/i18n";
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
 * `NEXT_LOCALE` cookie (persisted by the locale switcher, or seeded from the
 * visitor's `Accept-Language` header by the middleware on first visit), falling
 * back to negotiating that header here and finally the default locale. This
 * keeps the App Router + RSC setup lightweight and lets the server render the
 * right language on first paint. The resolved locale is passed to
 * `NextIntlClientProvider` in `layout.tsx`, so the client hydrates with the
 * same value the server rendered — no cookie re-read, no hydration mismatch.
 */
export default getRequestConfig(async () => {
  const [store, headerList] = await Promise.all([cookies(), headers()]);
  const locale = resolveRequestLocale(
    store.get(LOCALE_COOKIE)?.value,
    headerList.get("accept-language"),
  );

  return { locale, messages: CATALOGS[locale] };
});
