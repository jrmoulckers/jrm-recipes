"use client";

import * as React from "react";

import {
  type A11yPrefs,
  A11Y_COOKIE,
  A11Y_MANAGED_ATTRS,
  DEFAULT_A11Y,
  a11yAttributes,
  resolveTriState,
  serializeA11y,
} from "~/config/a11y";

type A11yContextValue = {
  prefs: A11yPrefs;
  /**
   * Effective on/off after resolving tri-state prefs against the live OS
   * signals (`prefers-reduced-motion` / `prefers-contrast`). Use this to render
   * toggle state so the panel reflects reality, not just the stored value.
   */
  effective: { motion: boolean; contrast: boolean };
  /** Merge a partial update into the current preferences. */
  update: (patch: Partial<A11yPrefs>) => void;
  /** Restore every preference to its default. */
  reset: () => void;
};

const A11yContext = React.createContext<A11yContextValue | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const CONTRAST_QUERY = "(prefers-contrast: more)";

function readSystem(): { motion: boolean; contrast: boolean } {
  if (typeof window === "undefined" || !window.matchMedia) {
    return { motion: false, contrast: false };
  }
  return {
    motion: window.matchMedia(MOTION_QUERY).matches,
    contrast: window.matchMedia(CONTRAST_QUERY).matches,
  };
}

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

  // OS signals. Seeded false for SSR/first paint (matchMedia is client-only),
  // then hydrated + kept live via listeners. Only read where no explicit pref
  // exists, so this never fights a user choice.
  const [system, setSystem] = React.useState({ motion: false, contrast: false });

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const motionMq = window.matchMedia(MOTION_QUERY);
    const contrastMq = window.matchMedia(CONTRAST_QUERY);
    const sync = () => setSystem(readSystem());
    sync();
    motionMq.addEventListener("change", sync);
    contrastMq.addEventListener("change", sync);
    return () => {
      motionMq.removeEventListener("change", sync);
      contrastMq.removeEventListener("change", sync);
    };
  }, []);

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

  const effective = React.useMemo(
    () => ({
      motion: resolveTriState(prefs.motion, system.motion),
      contrast: resolveTriState(prefs.contrast, system.contrast),
    }),
    [prefs.motion, prefs.contrast, system.motion, system.contrast],
  );

  const value = React.useMemo<A11yContextValue>(
    () => ({ prefs, effective, update, reset }),
    [prefs, effective, update, reset],
  );

  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

export function useA11y() {
  const ctx = React.useContext(A11yContext);
  if (!ctx) throw new Error("useA11y must be used within <A11yProvider>");
  return ctx;
}
