'use client';

/**
 * The concrete PostHog client adapter. The *only* module that imports the
 * vendor SDK (issue #306). It's dynamically imported by `<AnalyticsProvider>`
 * and only when a key is configured, so the SDK is never bundled into the
 * no-config path and the rest of the app stays vendor-agnostic behind
 * {@link AnalyticsBackend}.
 *
 * Capture is **cookieless** (`persistence: "memory"`) and routed through the
 * first-party `/ingest` proxy, honoring Heirloom's private-family-data stance.
 */
import { type AnalyticsBackend } from './backend';
import { INGEST_PATH, analyticsHost, analyticsKey } from './config';

let initialized = false;

/**
 * Initialize PostHog (once) and return a backend bound to it, or `null` when
 * unconfigured / on the server. Safe to call repeatedly. Re-initialization is
 * guarded so React StrictMode's double-invoke doesn't re-init the SDK.
 */
export async function createPostHogBackend(): Promise<AnalyticsBackend | null> {
  const key = analyticsKey();
  if (!key || typeof window === 'undefined') return null;

  const { default: posthog } = await import('posthog-js');

  if (!initialized) {
    posthog.init(key, {
      api_host: INGEST_PATH,
      ui_host: analyticsHost(),
      // Cookieless: keep persistence in memory so no analytics cookies are set.
      persistence: 'memory',
      // Pageviews are emitted manually by <PageviewTracker> (#322) to catch
      // App Router client navigations, so the SDK's own pageview would double-count.
      capture_pageview: false,
      // Autocapture is a *separate* option from `capture_pageview` and defaults to
      // `true`, so it has to be turned off explicitly (#703). Do not remove this:
      // autocapture events are built inside the SDK and handed straight to the
      // transport, so they never pass through `track()` and therefore never reach
      // `scrubProperties()` (./scrub) — the PII net covers only what this module
      // dispatches. Autocapture also sends `$el_text`, which on Heirloom is recipe
      // titles, cook names and group names, and `mask_all_text` defaults to `false`.
      autocapture: false,
      capture_pageleave: true,
      // Only create person profiles once a user is identified (#321).
      person_profiles: 'identified_only',
      // Honor Do Not Track at the SDK level too (belt-and-braces with #324).
      respect_dnt: true,
      disable_session_recording: true,
    });
    initialized = true;
  }

  return {
    capture: (event, properties) => {
      posthog.capture(event, properties);
    },
    identify: (distinctId, properties) => {
      posthog.identify(distinctId, properties);
    },
    alias: (distinctId, previousId) => {
      posthog.alias(distinctId, previousId);
    },
    reset: () => {
      posthog.reset();
    },
    optIn: () => {
      posthog.opt_in_capturing();
    },
    optOut: () => {
      posthog.opt_out_capturing();
    },
    hasOptedOut: () => posthog.has_opted_out_capturing(),
    isFeatureEnabled: (flagKey) => posthog.isFeatureEnabled(flagKey),
    getFeatureFlag: (flagKey) => posthog.getFeatureFlag(flagKey),
    onFeatureFlags: (callback) => {
      posthog.onFeatureFlags(callback);
    },
  };
}
