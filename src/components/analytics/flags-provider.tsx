"use client";

import * as React from "react";

import { track } from "~/lib/analytics";
import {
  getClientBackend,
  onClientBackendChange,
} from "~/lib/analytics/backend";
import {
  type FlagMap,
  type FlagValue,
  resolveFlag,
} from "~/lib/analytics/flags";

const FlagsContext = React.createContext<FlagMap>({});

/**
 * Seeds the client flag map from SSR-evaluated values (issue #335) so variants
 * render identically on the server and the first client paint — no flicker. Once
 * the live backend has loaded its flags it refreshes the seeded keys in place;
 * until then the SSR values stand, and when analytics is unconfigured the map
 * simply stays as-is (all control).
 */
export function FlagsProvider({
  children,
  initialFlags = {},
}: {
  children: React.ReactNode;
  initialFlags?: FlagMap;
}) {
  const [flags, setFlags] = React.useState<FlagMap>(initialFlags);

  React.useEffect(() => {
    const refresh = () => {
      const backend = getClientBackend();
      backend.onFeatureFlags(() => {
        setFlags((current) => {
          let changed = false;
          const next: FlagMap = { ...current };
          for (const key of Object.keys(current)) {
            const live = backend.getFeatureFlag(key);
            if (live !== undefined && live !== current[key]) {
              next[key] = live;
              changed = true;
            }
          }
          return changed ? next : current;
        });
      });
    };
    // Bind now (no-op backend today) and again whenever the real backend loads.
    refresh();
    return onClientBackendChange(refresh);
  }, []);

  return <FlagsContext.Provider value={flags}>{children}</FlagsContext.Provider>;
}

/**
 * Read a feature flag on the client and record a `$feature_flag_called` exposure
 * for experiment analysis (deduped per key/value, and consent-gated by `track`).
 * Returns `fallback` (control) when the flag is unset or analytics is off.
 */
export function useFeatureFlag(
  key: string,
  fallback: FlagValue = false,
): FlagValue {
  const flags = React.useContext(FlagsContext);
  const value = resolveFlag(flags, key, fallback);

  const lastExposed = React.useRef<FlagValue | null>(null);
  React.useEffect(() => {
    if (lastExposed.current === value) return;
    lastExposed.current = value;
    track("$feature_flag_called", {
      $feature_flag: key,
      $feature_flag_response: value,
    });
  }, [key, value]);

  return value;
}
