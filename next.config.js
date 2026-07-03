/**
 * Importing env here validates env vars at build time.
 * Run with `SKIP_ENV_VALIDATION` to skip (useful for Docker/CI lint).
 */
import "./src/env.js";

import withSerwistInit from "@serwist/next";

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
  images: {
    remotePatterns: [
      { hostname: "*.ufs.sh" },
      { hostname: "utfs.io" },
      { hostname: "img.clerk.com" },
    ],
  },
  experimental: {
    // Keep server action bodies small-but-generous for recipe imports.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default withSerwist(config);
