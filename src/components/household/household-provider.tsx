"use client";

import * as React from "react";

import {
  HOUSEHOLD_COOKIE,
  clampHouseholdSize,
  serializeHousehold,
} from "~/config/household";

type HouseholdContextValue = {
  /** Number of people to cook for, or null when no preference is set. */
  size: number | null;
  /** Set an explicit household size (clamped to the supported range). */
  setSize: (next: number) => void;
  /** Clear the preference so recipes use their own servings again. */
  clear: () => void;
};

const noop = () => {
  /* no-op fallback used when rendered outside the provider */
};

/** Safe default used when a consumer renders outside the provider (e.g. tests). */
const FALLBACK: HouseholdContextValue = {
  size: null,
  setSize: noop,
  clear: noop,
};

const HouseholdContext = React.createContext<HouseholdContextValue>(FALLBACK);

const ONE_YEAR = 60 * 60 * 24 * 365;

function persist(size: number | null) {
  try {
    if (size == null) {
      localStorage.removeItem(HOUSEHOLD_COOKIE);
      document.cookie = `${HOUSEHOLD_COOKIE}=;path=/;max-age=0;samesite=lax`;
      return;
    }
    const value = serializeHousehold(size);
    localStorage.setItem(HOUSEHOLD_COOKIE, value);
    document.cookie = `${HOUSEHOLD_COOKIE}=${encodeURIComponent(value)};path=/;max-age=${ONE_YEAR};samesite=lax`;
  } catch {
    /* storage unavailable (private mode) — the choice still applies this session */
  }
}

export function HouseholdProvider({
  children,
  initialSize = null,
}: {
  children: React.ReactNode;
  initialSize?: number | null;
}) {
  const [size, setSizeState] = React.useState<number | null>(initialSize);

  const setSize = React.useCallback((next: number) => {
    const clamped = clampHouseholdSize(next);
    persist(clamped);
    setSizeState(clamped);
  }, []);

  const clear = React.useCallback(() => {
    persist(null);
    setSizeState(null);
  }, []);

  const value = React.useMemo<HouseholdContextValue>(
    () => ({ size, setSize, clear }),
    [size, setSize, clear],
  );

  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  return React.useContext(HouseholdContext);
}
