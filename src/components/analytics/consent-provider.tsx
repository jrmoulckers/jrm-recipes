"use client";

import * as React from "react";

import {
  type ConsentStatus,
  ANALYTICS_CONSENT_COOKIE,
  serializeConsent,
} from "~/config/consent";
import { getClientBackend } from "~/lib/analytics/backend";
import {
  configureConsent,
  detectPrivacySignal,
  isCaptureAllowed,
} from "~/lib/analytics/consent";

type ConsentContextValue = {
  /** The user's explicit choice (or "unset"). */
  status: ConsentStatus;
  /** True when analytics is opt-in (consent required before any capture). */
  requireConsent: boolean;
  /** True when the browser sends Do Not Track or Global Privacy Control. */
  privacySignal: boolean;
  /** Whether capture is permitted right now. */
  captureAllowed: boolean;
  /** Whether a first-run choice is still pending (opt-in mode only). */
  needsChoice: boolean;
  grant: () => void;
  deny: () => void;
};

const ConsentContext = React.createContext<ConsentContextValue | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

function persist(status: ConsentStatus) {
  const value = serializeConsent(status);
  try {
    localStorage.setItem(ANALYTICS_CONSENT_COOKIE, value);
    document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${encodeURIComponent(value)};path=/;max-age=${ONE_YEAR};samesite=lax`;
  } catch {
    /* storage unavailable (private mode) — choice still applies this session */
  }
}

/**
 * Owns analytics consent for the browser (issue #324). It seeds the runtime gate
 * (`~/lib/analytics/consent`) from the SSR-resolved cookie, layers on the live
 * DNT/GPC signal detected on mount, and keeps the registered backend opted
 * in/out in lock-step so even the vendor SDK's own capture (e.g. pageleave)
 * stops the moment consent is withdrawn.
 */
export function ConsentProvider({
  children,
  initialStatus = "unset",
  requireConsent = false,
}: {
  children: React.ReactNode;
  initialStatus?: ConsentStatus;
  requireConsent?: boolean;
}) {
  const [status, setStatus] = React.useState<ConsentStatus>(initialStatus);
  const [privacySignal, setPrivacySignal] = React.useState(false);

  // Detect the browser privacy signal once on mount (SSR can't see it).
  React.useEffect(() => {
    setPrivacySignal(
      detectPrivacySignal(
        typeof navigator === "undefined" ? undefined : navigator,
        typeof window === "undefined"
          ? undefined
          : { doNotTrack: (window as { doNotTrack?: string | null }).doNotTrack },
      ),
    );
  }, []);

  // Keep the runtime gate + backend in sync with the current state.
  React.useEffect(() => {
    configureConsent({ requireConsent, status, privacySignal });
    const backend = getClientBackend();
    if (isCaptureAllowed()) backend.optIn();
    else backend.optOut();
  }, [requireConsent, status, privacySignal]);

  const grant = React.useCallback(() => {
    persist("granted");
    setStatus("granted");
  }, []);

  const deny = React.useCallback(() => {
    persist("denied");
    setStatus("denied");
    // Stop the SDK immediately and clear any identity from this device.
    const backend = getClientBackend();
    backend.optOut();
    backend.reset();
  }, []);

  const captureAllowed =
    !privacySignal &&
    status !== "denied" &&
    (!requireConsent || status === "granted");

  const value = React.useMemo<ConsentContextValue>(
    () => ({
      status,
      requireConsent,
      privacySignal,
      captureAllowed,
      needsChoice: requireConsent && status === "unset" && !privacySignal,
      grant,
      deny,
    }),
    [status, requireConsent, privacySignal, captureAllowed, grant, deny],
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

export function useConsent() {
  const ctx = React.useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used within <ConsentProvider>");
  return ctx;
}
