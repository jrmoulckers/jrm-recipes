/**
 * Importing env here validates env vars at build time.
 * Run with `SKIP_ENV_VALIDATION` to skip (useful for Docker/CI lint).
 */
import "./src/env.js";

import withSerwistInit from "@serwist/next";
import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

import { imageConfig } from "./src/config/next-image.js";

// Point the next-intl plugin at the request config (cookie-based locale
// resolution). This makes getTranslations/useTranslations, getLocale, and the
// formatters available throughout the App Router tree.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Stable per deploy: use the commit SHA when a platform provides it (Vercel),
// otherwise stamp the build time. Threaded into the offline page's precache
// revision so a new deploy invalidates the cached fallback.
const buildRevision =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  Date.now().toString(36);

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // The service worker only runs in production builds.
  disable: process.env.NODE_ENV === "development",
  // Don't force a full-page reload when connectivity returns: that could reload
  // the app out from under an active Cook Mode session. Updates are surfaced by
  // the user-controlled "update available" prompt instead (issue #163). The
  // `/~offline` fallback still reconnects itself via its own online handler.
  reloadOnOnline: false,
  // Root layout reads cookies() (for theme SSR), so every route renders
  // dynamically and nothing lands in the precache manifest automatically.
  // Precache the offline fallback + the offline recipe-image placeholder
  // explicitly so they're available with no network. Revisions are stamped per
  // build so a new deploy refreshes them.
  additionalPrecacheEntries: [
    { url: "/~offline", revision: buildRevision },
    { url: "/img/recipe-image-placeholder.svg", revision: buildRevision },
  ],
});

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  // Statically type all internal hrefs/router pushes against the app's real
  // route tree so a typo or renamed segment fails at compile time (#189).
  typedRoutes: true,
  // PostHog's proxied endpoints are sensitive to trailing-slash redirects.
  skipTrailingSlashRedirect: true,
  images: imageConfig,
  async rewrites() {
    // First-party reverse proxy for product analytics: browser capture hits
    // `/ingest/*` (same-origin, adblock-resilient) and Next forwards it to the
    // real PostHog host. No third-party origin appears in the network tab, and
    // no analytics config is required for the app to run — these rewrites just
    // resolve to the default host when the env var is unset.
    const host =
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
    const assetHost = host.includes("us.i.posthog.com")
      ? "https://us-assets.i.posthog.com"
      : host.includes("eu.i.posthog.com")
        ? "https://eu-assets.i.posthog.com"
        : host;
    return [
      {
        source: "/ingest/static/:path*",
        destination: `${assetHost}/static/:path*`,
      },
      { source: "/ingest/:path*", destination: `${host}/:path*` },
    ];
  },
  experimental: {
    // Keep server action bodies small-but-generous for recipe imports.
    serverActions: {
      bodySizeLimit: "4mb",
    },
    // Tree-shake large barrel packages so importing a handful of icons/utilities
    // doesn't pull the whole module graph into a route's bundle. Next rewrites
    // `import { X } from "pkg"` to the underlying deep import per used symbol.
    // Only the barrels actually imported in the app are listed (verified against
    // package.json + real import sites): the lucide icon set, the date-fns
    // utility barrel, and the individual Radix primitive packages in use.
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@radix-ui/react-avatar",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
    ],
  },
};

// Wrap with @next/bundle-analyzer, gated on ANALYZE=true (see `pnpm analyze`).
// Writes a static report to .next/analyze/ without trying to open a browser.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

export default withBundleAnalyzer(withSerwist(withNextIntl(config)));
