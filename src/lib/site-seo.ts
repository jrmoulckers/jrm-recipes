/**
 * Site-level schema.org JSON-LD: `Organization` and `WebSite` (issue #320).
 *
 * Rendered once on the landing page. The `WebSite` node carries a
 * `SearchAction` so Google can show a sitelinks search box wired to our real
 * recipe search (`/recipes?q=…`); the `Organization` node establishes a
 * consistent brand/knowledge presence. All values come from `brand` config and
 * are absolute URLs — nothing is hardcoded here.
 *
 * Framework-light and free of `server-only` so it can be unit-tested in
 * isolation. Serialize with `serializeJsonLd` before embedding in a script.
 */
import { brand } from "~/config/brand";
import { absoluteUrl } from "~/lib/utils";

/** Square brand mark shipped in `public/icons`, used as the Organization logo. */
const LOGO_PATH = "/icons/icon-512.png";

/**
 * `WebSite` with a `SearchAction` pointing at recipe search. The
 * `{search_term_string}` placeholder is intentionally left un-encoded so Google
 * can substitute the user's query into the `q` param.
 */
export function buildWebSiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brand.name,
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl("/recipes")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** `Organization` with brand name, canonical URL, and an absolute logo URL. */
export function buildOrganizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    url: absoluteUrl("/"),
    logo: absoluteUrl(LOGO_PATH),
  };
}
