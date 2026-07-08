/**
 * The typed, vendor-agnostic analytics **client** (issue #305).
 *
 * This is the one choke point instrumentation imports. It validates events
 * against the taxonomy (`./events`) at compile time, scrubs properties for PII
 * (`./scrub`) at runtime, and dispatches to whatever backend `<AnalyticsProvider>`
 * registered — or the no-op when analytics is unconfigured. Every function is a
 * safe no-op that never throws, so a tracking call can never break the UI.
 *
 * Server actions must use `./server` instead (this module targets the browser
 * where the backend holds the current distinct id).
 */
import { getClientBackend } from "./backend";
import { isCaptureAllowed } from "./consent";
import { type AnalyticsEventName, type EventProperties } from "./events";
import { scrubProperties } from "./scrub";

export { type AnalyticsEvent, type AnalyticsEventName } from "./events";

/**
 * Emit a taxonomy-valid event. The `name` constrains the allowed `properties`
 * shape, so `track("recipe_created", { … })` fails to compile if a property is
 * missing, misspelled, or the wrong type.
 */
export function track<K extends AnalyticsEventName>(
  name: K,
  properties: EventProperties[K],
): void {
  if (!isCaptureAllowed()) return;
  try {
    getClientBackend().capture(name, scrubProperties(properties));
  } catch {
    // Instrumentation must never throw or block the UI.
  }
}

/** Associate the current browser with a stable distinct id (see #321). */
export function identify(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  if (!isCaptureAllowed()) return;
  try {
    getClientBackend().identify(distinctId, scrubProperties(properties));
  } catch {
    /* no-op */
  }
}

/** Alias an anonymous device id to an identified user id (funnel stitching). */
export function alias(distinctId: string, previousId?: string): void {
  if (!isCaptureAllowed()) return;
  try {
    getClientBackend().alias(distinctId, previousId);
  } catch {
    /* no-op */
  }
}

/** Clear identity on sign-out so identities don't bleed on shared devices. */
export function reset(): void {
  try {
    getClientBackend().reset();
  } catch {
    /* no-op */
  }
}
