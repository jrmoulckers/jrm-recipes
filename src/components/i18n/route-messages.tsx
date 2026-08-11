import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { PATHNAME_HEADER } from '~/config/i18n';
import { namespacesForPathname, pickMessages } from '~/i18n/messages';

/**
 * Route-scoped message provider (#674).
 *
 * `NextIntlClientProvider` receives `messages` as a prop, so whatever it is
 * handed is serialized into the RSC flight payload. The root layout therefore
 * only carries the namespaces the persistent shell needs, and each page adds its
 * own on top through this component.
 *
 * It has to sit at the **page** level, not in a layout or a template. Layouts
 * are preserved across client-side navigation and are not re-rendered on the
 * server when the route changes; templates remount on the client, but their
 * server output belongs to the shared part of the tree and is not re-fetched
 * either. Both were measured keeping the *previous* route's namespaces after a
 * soft navigation, which renders raw message keys. The page segment is the only
 * one guaranteed to be re-rendered for every navigation.
 *
 * `use-intl`'s provider **replaces** rather than merges messages when providers
 * nest, so this passes the route's full set (shell namespaces included) instead
 * of only the delta — otherwise everything inside this boundary would lose the
 * global namespaces.
 */
export async function RouteMessages({ children }: { children: ReactNode }) {
  const [headerList, locale, messages] = await Promise.all([headers(), getLocale(), getMessages()]);

  const namespaces = namespacesForPathname(headerList.get(PATHNAME_HEADER));

  return (
    <NextIntlClientProvider locale={locale} messages={pickMessages(messages, namespaces)}>
      {children}
    </NextIntlClientProvider>
  );
}

/**
 * Wrap a page's default export so its client subtree gets the route's messages.
 *
 * Applied to every `page.tsx`; `scripts/i18n-route-scope.test.mjs` fails CI if a
 * page is added without it, because such a page would render with only the shell
 * namespaces and show raw message keys.
 */
export function withRouteMessages<P extends object>(
  // `Promise<void>` covers redirect-only pages, which never return an element.
  Page: (props: P) => ReactNode | Promise<ReactNode | void>,
) {
  // Async Server Components are not yet expressible in the JSX element type, so
  // the cast keeps `<Segment />` an *element* (preserving streaming and Suspense
  // boundaries inside the page) rather than an awaited function call.
  const Segment = Page as unknown as (props: P) => ReactNode;

  function RouteScopedPage(props: P) {
    return (
      <RouteMessages>
        <Segment {...props} />
      </RouteMessages>
    );
  }

  RouteScopedPage.displayName = `withRouteMessages(${Page.name || 'Page'})`;
  return RouteScopedPage;
}
