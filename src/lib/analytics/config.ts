import { env } from "~/env";

/**
 * Analytics configuration — the single place that reads the (optional) product
 * analytics env vars. Heirloom's zero-config principle holds: with no key set,
 * {@link isAnalyticsConfigured} is false and every analytics call degrades to a
 * safe no-op (see `./backend` + `./index`), so the app still boots and builds.
 *
 * We never wire a real vendor key into the source; the backend (PostHog) is only
 * loaded when a deploy supplies `NEXT_PUBLIC_POSTHOG_KEY`.
 */

/** Default ingestion host when a deploy doesn't override it. */
export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/** Default static-asset host paired with {@link DEFAULT_POSTHOG_HOST}. */
export const DEFAULT_POSTHOG_ASSET_HOST = "https://us-assets.i.posthog.com";

/**
 * First-party path all browser capture is routed through (a Next rewrite in
 * `next.config.js` proxies it to the real host). Keeps ingestion first-party and
 * adblock-resilient, and means no third-party origin appears in the network tab.
 */
export const INGEST_PATH = "/ingest";

/** The public project key, or undefined when analytics is unconfigured. */
export function analyticsKey(): string | undefined {
  // `emptyStringAsUndefined` in env.js already maps "" -> undefined.
  return env.NEXT_PUBLIC_POSTHOG_KEY;
}

/** The configured ingestion host (used server-side and for the client proxy). */
export function analyticsHost(): string {
  return env.NEXT_PUBLIC_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST;
}

/** True once a project key is present; gates all real capture. */
export function isAnalyticsConfigured(): boolean {
  return Boolean(analyticsKey());
}

/**
 * True when analytics requires explicit opt-in consent (GDPR-style) before any
 * capture. When false (the default), the app uses an opt-out model but still
 * honors DNT/GPC and an explicit opt-out — see `~/lib/analytics/consent`.
 */
export function analyticsRequiresConsent(): boolean {
  return env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT === "1";
}
