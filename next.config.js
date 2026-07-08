/**
 * Importing env here validates env vars at build time.
 * Run with `SKIP_ENV_VALIDATION` to skip (useful for Docker/CI lint).
 */
import "./src/env.js";

import withSerwistInit from "@serwist/next";
import bundleAnalyzer from "@next/bundle-analyzer";

import { imageConfig } from "./src/config/next-image.js";

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
  reloadOnOnline: true,
  // Root layout reads cookies() (for theme SSR), so every route renders
  // dynamically and nothing lands in the precache manifest automatically.
  // Precache the offline fallback explicitly so it's available with no network.
  // The revision is stamped per build so a new deploy refreshes the page.
  additionalPrecacheEntries: [
    { url: "/~offline", revision: buildRevision },
  ],
});

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
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
      { source: "/ingest/static/:path*", destination: `${assetHost}/static/:path*` },
      { source: "/ingest/:path*", destination: `${host}/:path*` },
    ];
  },
  experimental: {
    // Keep server action bodies small-but-generous for recipe imports.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

// Wrap with @next/bundle-analyzer, gated on ANALYZE=true (see `pnpm analyze`).
// Writes a static report to .next/analyze/ without trying to open a browser.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

export default withBundleAnalyzer(withSerwist(config));
