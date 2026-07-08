/**
 * The runtime consent gate (issue #324).
 *
 * This module is the single source of truth the typed client (`./index`)
 * consults before dispatching any event. Keeping the decision here — rather than
 * relying only on the vendor SDK's own opt-out — means capture is blocked *before*
 * it ever reaches a backend, so "no events before consent" holds even for the
 * no-op backend and in tests.
 *
 * The state is a tiny module-level singleton configured once by the client
 * `<ConsentProvider>` from the SSR-resolved cookie plus the browser's privacy
 * signals. All helpers are pure and synchronous so instrumentation stays cheap.
 */
import { type ConsentStatus } from "~/config/consent";

export type ConsentState = {
  /** When true, capture is opt-in: nothing is sent until status === "granted". */
  requireConsent: boolean;
  /** The user's explicit choice, or "unset" when they haven't decided. */
  status: ConsentStatus;
  /** True when the browser sends Do Not Track or Global Privacy Control. */
  privacySignal: boolean;
};

const DEFAULT_STATE: ConsentState = {
  requireConsent: false,
  status: "unset",
  privacySignal: false,
};

let state: ConsentState = { ...DEFAULT_STATE };

/** Merge a partial update into the current consent state. */
export function configureConsent(patch: Partial<ConsentState>): void {
  state = { ...state, ...patch };
}

/** Reset to defaults — used in tests. */
export function resetConsent(): void {
  state = { ...DEFAULT_STATE };
}

export function getConsentState(): ConsentState {
  return state;
}

/**
 * Whether capture is currently permitted. The rules, in order:
 *   1. A browser privacy signal (DNT/GPC) always blocks — regardless of config.
 *   2. An explicit "denied" always blocks.
 *   3. When consent is required (opt-in), only an explicit "granted" allows.
 *   4. Otherwise (opt-out model) capture is allowed unless denied above.
 */
export function isCaptureAllowed(): boolean {
  if (state.privacySignal) return false;
  if (state.status === "denied") return false;
  if (state.requireConsent) return state.status === "granted";
  return true;
}

type PrivacyNavigator = {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
  msDoNotTrack?: string | null;
};

type PrivacyWindow = {
  doNotTrack?: string | null;
};

/**
 * Detect Do Not Track / Global Privacy Control across their several historical
 * spellings. Pure (takes the navigator/window in) so it's unit-testable and
 * never touches globals at import time.
 */
export function detectPrivacySignal(
  nav: PrivacyNavigator | undefined,
  win: PrivacyWindow | undefined = undefined,
): boolean {
  if (!nav) return false;
  if (nav.globalPrivacyControl === true) return true;
  const dnt = nav.doNotTrack ?? win?.doNotTrack ?? nav.msDoNotTrack;
  return dnt === "1" || dnt === "yes";
}
