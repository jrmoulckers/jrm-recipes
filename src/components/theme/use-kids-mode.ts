"use client";

import * as React from "react";

import { useA11y } from "~/components/a11y/a11y-provider";
import { useTheme } from "~/components/theme/theme-provider";

/**
 * The single entry point for flipping Kids mode. It couples the two orthogonal
 * axes that Kids mode spans:
 *
 *   • UI theme — switches to/from the `kids` mode, remembering and restoring the
 *     grown-up's prior mode (owned by the theme provider).
 *   • Accessibility (#445) — bumps *unset* comfort defaults to kid-friendly
 *     values (larger text + easy-reading type) and snapshots the prior a11y
 *     prefs, restoring them when Kids mode turns off. Explicit grown-up choices
 *     are never overwritten.
 *
 * Both the always-visible header toggle and the accessibility panel's Kids
 * switch go through this hook, so the two entry points stay perfectly in sync.
 */
export function useKidsMode() {
  const { theme, setKidsMode: setThemeKidsMode } = useTheme();
  const { setKidsDefaults } = useA11y();
  const kidsOn = theme === "kids";

  const setKidsMode = React.useCallback(
    (on: boolean) => {
      // a11y first so the pre-Kids snapshot is captured before anything flips.
      setKidsDefaults(on);
      setThemeKidsMode(on);
    },
    [setKidsDefaults, setThemeKidsMode],
  );

  return { kidsOn, setKidsMode };
}
