import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import { cookies } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import {
  Fraunces,
  Nunito,
  Inter,
  Baloo_2,
  JetBrains_Mono,
} from "next/font/google";

import { brand } from "~/config/brand";
import { env } from "~/env";
import {
  DEFAULT_COLOR_SCHEME,
  DEFAULT_UI_THEME,
  SCHEME_COOKIE,
  THEME_COOKIE,
  isColorScheme,
  isUITheme,
} from "~/config/themes";
import { A11Y_COOKIE, a11yAttributes, parseA11y } from "~/config/a11y";
import { HOUSEHOLD_COOKIE, parseHousehold } from "~/config/household";
import { ANALYTICS_CONSENT_COOKIE, parseConsent } from "~/config/consent";
import { analyticsRequiresConsent } from "~/lib/analytics/config";
import { getAllFlags } from "~/lib/analytics/server";
import { atkinson } from "~/fonts/atkinson";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { localeDirection, openGraphLocale } from "~/config/i18n";
import { preconnectOrigins } from "~/config/resource-hints";
import { isAuthConfigured, getCurrentUser } from "~/server/auth";
import { cn } from "~/lib/utils";
import { Providers } from "~/app/providers";
import { ThemeScript } from "~/components/theme/theme-script";
import { A11yScript } from "~/components/a11y/a11y-script";

// Font loading is tuned for the multi-theme setup (#182). Only ONE family — the
// shared body font (Nunito) — is preloaded, because it paints on the default and
// most other themes. The four display/decorative families are `preload: false`:
// their `@font-face` rules stay in the document (so a client-side theme switch
// can still apply the right font with no flash), but the browser only downloads
// each one when the active theme's CSS actually paints it. On the default
// (kitchen) theme that means just two families (Nunito + Fraunces) instead of
// all five. Every family gets a size-matched `fallback` stack + `adjustFontFallback`
// so the swap-in stays within CLS budget.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
  fallback: ["ui-serif", "Georgia", "serif"],
  adjustFontFallback: true,
});
const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
  preload: true,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  adjustFontFallback: true,
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  adjustFontFallback: true,
});
const baloo = Baloo_2({
  subsets: ["latin"],
  variable: "--font-baloo",
  display: "swap",
  preload: false,
  fallback: ["ui-rounded", "Segoe UI", "sans-serif"],
  adjustFontFallback: true,
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "monospace"],
  adjustFontFallback: true,
});

export async function generateMetadata(): Promise<Metadata> {
  // Localize to the active locale (resolved from the NEXT_LOCALE cookie by the
  // i18n request config). Title/description/OpenGraph read from the catalog; the
  // brand wordmark, colors, and URLs stay in the single brand/env config.
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "metadata" });
  const title = `${brand.name} — ${t("tagline")}`;
  const description = t("description");

  return {
    applicationName: brand.name,
    title: {
      default: title,
      template: `%s · ${brand.name}`,
    },
    description,
    manifest: "/manifest.webmanifest",
    metadataBase: new URL(env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: brand.name,
    },
    icons: {
      icon: "/favicon.ico",
      apple: "/icons/icon-192.png",
    },
    openGraph: {
      type: "website",
      title,
      description,
      siteName: brand.name,
      locale: openGraphLocale(locale),
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: brand.backgroundColor },
    { media: "(prefers-color-scheme: dark)", color: "#161310" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const schemeCookie = cookieStore.get(SCHEME_COOKIE)?.value;
  const theme = isUITheme(themeCookie) ? themeCookie : DEFAULT_UI_THEME;
  const scheme = isColorScheme(schemeCookie)
    ? schemeCookie
    : DEFAULT_COLOR_SCHEME;
  const a11y = parseA11y(cookieStore.get(A11Y_COOKIE)?.value);
  const household = parseHousehold(cookieStore.get(HOUSEHOLD_COOKIE)?.value);
  const consent = parseConsent(cookieStore.get(ANALYTICS_CONSENT_COOKIE)?.value);
  const locale = await getLocale();
  const messages = await getMessages();
  const currentUser = await getCurrentUser();
  // SSR-evaluate feature flags for the identified user so client variants don't
  // flicker on load (#335). Returns {} (all control) when analytics is off.
  const flags = await getAllFlags(currentUser?.id ?? "anonymous");

  const authConfigured = isAuthConfigured();

  const tree = (
    <html
      lang={locale}
      dir={localeDirection(locale)}
      data-theme={theme}
      {...a11yAttributes(a11y)}
      className={cn(
        fraunces.variable,
        nunito.variable,
        inter.variable,
        baloo.variable,
        jetbrains.variable,
        atkinson.variable,
        scheme === "dark" && "dark",
      )}
      suppressHydrationWarning
    >
      <head>
        {preconnectOrigins(authConfigured).flatMap((origin) => [
          <link key={`preconnect-${origin}`} rel="preconnect" href={origin} />,
          <link
            key={`dns-prefetch-${origin}`}
            rel="dns-prefetch"
            href={origin}
          />,
        ])}
        <ThemeScript />
        <A11yScript />
      </head>
      <body className="min-h-dvh bg-background">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers
            initialTheme={theme}
            initialScheme={scheme}
            initialA11y={a11y}
            initialUserId={currentUser?.id ?? null}
            initialConsent={consent}
            requireConsent={analyticsRequiresConsent()}
            initialFlags={flags}
            initialHousehold={household}
          >
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );

  // Only mount ClerkProvider when auth is actually configured.
  return authConfigured ? <ClerkProvider>{tree}</ClerkProvider> : tree;
}
