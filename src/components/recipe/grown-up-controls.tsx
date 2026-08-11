'use client';

import * as React from 'react';

import { useThemeBehavior } from '~/components/theme/theme-provider';

/**
 * Hides grown-up / destructive recipe actions (Delete, Adapt/fork, Share, reel
 * export, Edit) while Kids mode is active (#443).
 *
 * This is a client-side, per-device *Kids mode* convenience guard against
 * accidental taps. It is NOT a security boundary. Real permissions stay server-side
 * (see #345/#367). Visibility is driven off the active theme's `kidSafe` flag
 * only: when Kids mode is on the children are not rendered at all (so the
 * surrounding flex row leaves no empty gap). Otherwise children pass through
 * unchanged. Note this deliberately does NOT key off `simplifiedChrome`. The
 * "Simple"/barebones mode is an adult low-vision / reduced-complexity theme, so
 * grown-ups there must keep Edit/Delete/Share on their own recipes.
 */
export function GrownUpControls({ children }: { children: React.ReactNode }) {
  const { kidSafe } = useThemeBehavior();
  if (kidSafe) return null;
  return <>{children}</>;
}
