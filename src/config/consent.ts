/**
 * Analytics consent — persisted like the app's other per-device preferences
 * (a11y/theme) so the server can render the correct state with no flash.
 *
 * Consent is intentionally simple: a single cookie holding one of three states.
 * "unset" means the user hasn't chosen yet; whether that permits capture depends
 * on `NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT` (opt-in vs opt-out), enforced by the
 * runtime gate in `~/lib/analytics/consent`.
 */

export const ANALYTICS_CONSENT_COOKIE = "heirloom-analytics-consent";

export type ConsentStatus = "granted" | "denied" | "unset";

/** Parse a (decoded) cookie/localStorage value into a safe consent status. */
export function parseConsent(raw: string | null | undefined): ConsentStatus {
  return raw === "granted" || raw === "denied" ? raw : "unset";
}

/** Serialize consent for the cookie/localStorage (round-trips with parseConsent). */
export function serializeConsent(status: ConsentStatus): string {
  return status;
}
