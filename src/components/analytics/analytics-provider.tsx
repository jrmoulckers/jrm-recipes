"use client";

import * as React from "react";

import { isAnalyticsConfigured } from "~/lib/analytics/config";
import { clearClientBackend, setClientBackend } from "~/lib/analytics/backend";
import { createPostHogBackend } from "~/lib/analytics/posthog-client";

/**
 * Mounts the analytics backend once for the whole app (issue #306).
 *
 * When no key is configured this renders its children and does nothing else —
 * the app boots, builds, and runs with zero analytics config. When a key is
 * present it lazily loads the PostHog adapter and registers it as the client
 * backend so the typed `track`/`identify` API (`~/lib/analytics`) starts
 * dispatching real events.
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    if (!isAnalyticsConfigured()) return;
    let active = true;
    void createPostHogBackend().then((backend) => {
      if (active && backend) setClientBackend(backend);
    });
    return () => {
      active = false;
      clearClientBackend();
    };
  }, []);

  return <>{children}</>;
}
