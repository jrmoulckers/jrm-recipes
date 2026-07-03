/**
 * Importing env here validates env vars at build time.
 * Run with `SKIP_ENV_VALIDATION` to skip (useful for Docker/CI lint).
 */
import "./src/env.js";

import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // The service worker only runs in production builds.
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
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
