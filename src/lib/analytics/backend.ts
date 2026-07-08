/**
 * Vendor-agnostic analytics backend contract + a tiny client-side registry.
 *
 * This is the seam that keeps the rest of the app from ever importing a vendor
 * SDK directly (issue #305/#306): the concrete PostHog adapter (`./posthog-client`)
 * is created by `<AnalyticsProvider>` and registered here; call sites only ever
 * touch the typed `track`/`identify`/`reset` API in `./index`, which dispatches
 * to whatever backend is registered — or the built-in {@link noopBackend} when
 * analytics is unconfigured. Swapping/self-hosting the vendor is a one-file change.
 *
 * Every method is intentionally fire-and-forget and must never throw.
 */
export interface AnalyticsBackend {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, properties?: Record<string, unknown>): void;
  alias(distinctId: string, previousId?: string): void;
  reset(): void;
  optIn(): void;
  optOut(): void;
  hasOptedOut(): boolean;
  isFeatureEnabled(key: string): boolean | undefined;
  getFeatureFlag(key: string): string | boolean | undefined;
  onFeatureFlags(callback: () => void): void;
}

/**
 * The default backend used everywhere analytics is unconfigured (no key), on the
 * server, and in tests. Does nothing and never throws — the core of the app's
 * graceful-degradation guarantee for instrumentation.
 */
export const noopBackend: AnalyticsBackend = {
  capture() {
    /* no-op */
  },
  identify() {
    /* no-op */
  },
  alias() {
    /* no-op */
  },
  reset() {
    /* no-op */
  },
  optIn() {
    /* no-op */
  },
  optOut() {
    /* no-op */
  },
  hasOptedOut() {
    return false;
  },
  isFeatureEnabled() {
    return undefined;
  },
  getFeatureFlag() {
    return undefined;
  },
  onFeatureFlags() {
    /* no-op */
  },
};

let clientBackend: AnalyticsBackend | null = null;

/** Register the live client backend (called once by `<AnalyticsProvider>`). */
export function setClientBackend(backend: AnalyticsBackend): void {
  clientBackend = backend;
}

/** Drop the registered backend (used on teardown and in tests). */
export function clearClientBackend(): void {
  clientBackend = null;
}

/** The registered client backend, or the no-op when none is configured. */
export function getClientBackend(): AnalyticsBackend {
  return clientBackend ?? noopBackend;
}

/** True when a real (non-no-op) backend has been registered. */
export function hasClientBackend(): boolean {
  return clientBackend !== null;
}
