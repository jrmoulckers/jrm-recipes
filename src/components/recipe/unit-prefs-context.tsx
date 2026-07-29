"use client";

import * as React from "react";

import type { CustomUnitDef, UnitPrefs } from "~/lib/units";

/**
 * The viewer's unit preferences + custom units, made ambient so every
 * {@link import("./ingredients-panel").IngredientsPanel} in a subtree can
 * auto-convert without each intermediate component prop-drilling them. Cook Mode
 * in particular mounts the panel from several nested sub-components, so a context
 * keeps the wiring to a single provider at the page boundary.
 */
export type UnitPrefsContextValue = {
  prefs?: UnitPrefs;
  customs?: readonly CustomUnitDef[];
};

const UnitPrefsContext = React.createContext<UnitPrefsContextValue>({});

export function UnitPrefsProvider({
  prefs,
  customs,
  children,
}: UnitPrefsContextValue & { children: React.ReactNode }) {
  const value = React.useMemo<UnitPrefsContextValue>(
    () => ({ prefs, customs }),
    [prefs, customs],
  );
  return (
    <UnitPrefsContext.Provider value={value}>
      {children}
    </UnitPrefsContext.Provider>
  );
}

/** Read the ambient viewer unit preferences (empty object when no provider). */
export function useUnitPrefsContext(): UnitPrefsContextValue {
  return React.useContext(UnitPrefsContext);
}
