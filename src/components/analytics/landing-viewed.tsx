"use client";

import * as React from "react";

import { track } from "~/lib/analytics";

/**
 * Fires the `landing_viewed` funnel event once when the marketing landing page
 * mounts (issue #328) — the top of the activation funnel (landing → sign up →
 * first recipe → first cook). Renders nothing; it's a tiny client island so the
 * landing page itself can stay a static Server Component. Consent-gated via
 * `track`, and deduped per mount by an effect ref so React 18 strict-mode
 * double-invoke doesn't double-count.
 */
export function LandingViewedTracker() {
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    track("landing_viewed", {});
  }, []);
  return null;
}
