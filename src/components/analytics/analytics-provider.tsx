"use client";

import * as React from "react";

import { identify, reset } from "~/lib/analytics";
import { isAnalyticsConfigured } from "~/lib/analytics/config";
import { isCaptureAllowed } from "~/lib/analytics/consent";
import { clearClientBackend, setClientBackend } from "~/lib/analytics/backend";
import { createPostHogBackend } from "~/lib/analytics/posthog-client";

/**
 * Mounts the analytics backend once for the whole app (issue #306) and keeps the
 * browser identity in sync with the signed-in user (issue #321).
 *
 * When no key is configured this renders its children and does nothing else —
 * the app boots, builds, and runs with zero analytics config. When a key is
 * present it lazily loads the PostHog adapter and registers it as the client
 * backend so the typed `track`/`identify` API (`~/lib/analytics`) starts
 * dispatching real events.
 *
 * Identity: once the backend is ready we `identify` with the internal user id
 * (never PII), which stitches the pre-signup anonymous session to the user. On
 * sign-out (`userId` → null) we `reset()` so identities never bleed across
 * accounts on a shared family device.
 */
export function AnalyticsProvider({
  children,
  userId = null,
}: {
  children: React.ReactNode;
  userId?: string | null;
}) {
  // `ready` gates identity on the async backend mount: when analytics is
  // unconfigured we're immediately "ready" (identify is a harmless no-op);
  // when configured we wait for the real backend so the identify isn't lost.
  const [ready, setReady] = React.useState(() => !isAnalyticsConfigured());

  React.useEffect(() => {
    if (!isAnalyticsConfigured()) return;
    let active = true;
    void createPostHogBackend().then((backend) => {
      if (active && backend) {
        setClientBackend(backend);
        // Respect a prior opt-out / DNT decision the instant the SDK is live.
        if (!isCaptureAllowed()) backend.optOut();
        setReady(true);
      }
    });
    return () => {
      active = false;
      clearClientBackend();
    };
  }, []);

  const identifiedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!ready) return;
    if (userId) {
      if (identifiedRef.current !== userId) {
        identify(userId);
        identifiedRef.current = userId;
      }
    } else if (identifiedRef.current) {
      reset();
      identifiedRef.current = null;
    }
  }, [ready, userId]);

  return <>{children}</>;
}
