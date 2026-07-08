"use client";

import * as React from "react";

import { useThemeBehavior } from "~/components/theme/theme-provider";

/**
 * Hides grown-up / destructive recipe actions (Delete, Adapt/fork, Share, reel
 * export, Edit) while Kids mode is active (#443).
 *
 * This is a client-side, per-device *Kids mode* convenience guard against
 * accidental taps — NOT a security boundary. Real permissions stay server-side
 * (see #345/#367). Visibility is driven off the active theme's behavior flags:
 * when the mode asks for simplified chrome or kid-safe browsing the children are
 * not rendered at all (so the surrounding flex row leaves no empty gap);
 * otherwise children pass through unchanged and non-Kids modes look exactly as
 * before.
 */
export function GrownUpControls({ children }: { children: React.ReactNode }) {
  const { simplifiedChrome, kidSafe } = useThemeBehavior();
  if (simplifiedChrome || kidSafe) return null;
  return <>{children}</>;
}
