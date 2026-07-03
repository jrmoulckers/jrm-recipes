"use client";

import * as React from "react";

import {
  type A11yPrefs,
  A11Y_COOKIE,
  A11Y_MANAGED_ATTRS,
  DEFAULT_A11Y,
  a11yAttributes,
  serializeA11y,
} from "~/config/a11y";

type A11yContextValue = {
  prefs: A11yPrefs;
  /** Merge a partial update into the current preferences. */
  update: (patch: Partial<A11yPrefs>) => void;
  /** Restore every preference to its default. */
  reset: () => void;
};

const A11yContext = React.createContext<A11yContextValue | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

function persist(prefs: A11yPrefs) {
  const value = serializeA11y(prefs);
  try {
    localStorage.setItem(A11Y_COOKIE, value);
    document.cookie = `${A11Y_COOKIE}=${encodeURIComponent(value)};path=/;max-age=${ONE_YEAR};samesite=lax`;
  } catch {
    /* storage unavailable (private mode) — settings still apply this session */
  }
}

function applyAttributes(prefs: A11yPrefs) {
  const el = document.documentElement;
  const next = a11yAttributes(prefs);
  for (const attr of A11Y_MANAGED_ATTRS) {
    const value = next[attr];
    if (value) el.setAttribute(attr, value);
    else el.removeAttribute(attr);
  }
}

export function A11yProvider({
  children,
  initialPrefs,
}: {
  children: React.ReactNode;
  initialPrefs?: A11yPrefs;
}) {
  const [prefs, setPrefs] = React.useState<A11yPrefs>(
    initialPrefs ?? DEFAULT_A11Y,
  );

  // Keep <html> attributes in sync with state (covers SSR mismatch + updates).
  React.useEffect(() => {
    applyAttributes(prefs);
  }, [prefs]);

  const update = React.useCallback((patch: Partial<A11yPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      persist(next);
      return next;
    });
  }, []);

  const reset = React.useCallback(() => {
    setPrefs(() => {
      persist(DEFAULT_A11Y);
      return { ...DEFAULT_A11Y };
    });
  }, []);

  const value = React.useMemo<A11yContextValue>(
    () => ({ prefs, update, reset }),
    [prefs, update, reset],
  );

  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

export function useA11y() {
  const ctx = React.useContext(A11yContext);
  if (!ctx) throw new Error("useA11y must be used within <A11yProvider>");
  return ctx;
}
