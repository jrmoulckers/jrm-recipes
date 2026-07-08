"use client";

import * as React from "react";

import { isInteractiveShortcutTarget } from "~/lib/cook-state";
import { resolveSwipe, resolveTapZone } from "~/lib/swipe";

/**
 * One-handed step navigation for Cook Mode (issue #400): tap the left/right
 * third of the step to go back/forward, or swipe horizontally. Returns handlers
 * to spread onto the step container.
 *
 * Taps and swipes originating from an interactive control (timer buttons,
 * ingredient checkboxes, links, the read-aloud toggle, a step video) are
 * ignored via the same guard the keyboard shortcuts use, so navigation never
 * hijacks a real control. A completed swipe suppresses the click it precedes so
 * a single gesture never both swipes *and* taps.
 */
export function useOneHandedNav({
  onNext,
  onPrevious,
}: {
  onNext: () => void;
  onPrevious: () => void;
}) {
  const startRef = React.useRef<{ x: number; y: number } | null>(null);
  const swipedRef = React.useRef(false);

  const onTouchStart = React.useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    startRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    swipedRef.current = false;
  }, []);

  const onTouchEnd = React.useCallback(
    (event: React.TouchEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || isInteractiveShortcutTarget(event.target)) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const direction = resolveSwipe(
        touch.clientX - start.x,
        touch.clientY - start.y,
      );
      if (!direction) return;
      // Mark so the synthetic click that follows this tap is ignored.
      swipedRef.current = true;
      if (direction === "next") onNext();
      else onPrevious();
    },
    [onNext, onPrevious],
  );

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (swipedRef.current) {
        swipedRef.current = false;
        return;
      }
      if (isInteractiveShortcutTarget(event.target)) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const direction = resolveTapZone(event.clientX, rect.left, rect.width);
      if (!direction) return;
      if (direction === "next") onNext();
      else onPrevious();
    },
    [onNext, onPrevious],
  );

  return { onClick, onTouchStart, onTouchEnd };
}
