import * as React from "react";
import { NextIntlClientProvider } from "next-intl";

import { DEFAULT_LOCALE, type Locale } from "~/config/i18n";
import enMessages from "~/messages/en.json";

type Messages = React.ComponentProps<typeof NextIntlClientProvider>["messages"];

/**
 * Wrap a component under test in the i18n provider with the English catalog so
 * `useTranslations`/`useFormatter` resolve exactly as they do in the app. Pass a
 * different `locale`/`messages` to exercise other languages.
 */
export function IntlWrapper({
  children,
  locale = DEFAULT_LOCALE,
  messages = enMessages,
}: {
  children: React.ReactNode;
  locale?: Locale;
  messages?: Messages;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
