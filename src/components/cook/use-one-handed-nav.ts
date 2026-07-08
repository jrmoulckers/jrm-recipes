"use client";

import * as React from "react";

import { isInteractiveShortcutTarget } from "~/lib/cook-state";
import { resolveSwipe, resolveTapZone } from "~/lib/swipe";

/** Finger travel (px) before the gesture axis (horizontal vs vertical) locks. */
const AXIS_SLOP = 8;
/** How far the card can rubber-band past the first/last step. */
const RUBBER_BAND_LIMIT = 56;

function rubberBand(distance: number): number {
  return Math.min(distance * 0.3, RUBBER_BAND_LIMIT);
}

/**
 * One-handed step navigation for Cook Mode (issues #400, #89): tap the
 * left/right third of the step to go back/forward, or drag horizontally to
 * navigate. Built on Pointer Events so it works for touch, pen and mouse, and
 * returns handlers + a live `dragStyle` to spread onto the step container.
 *
 * While dragging, the card follows the pointer and rubber-bands (resists) at
 * the first/last step; releasing past the swipe threshold navigates (gated by
 * `canNext` / `canPrevious`). Vertical drags keep native scrolling — the axis
 * locks after a small slop and only horizontal gestures are captured, so the
 * step video/controls and page scroll are never hijacked. Gestures starting on
 * an interactive control are ignored via the same guard the keyboard shortcuts
 * use, and a committed drag suppresses the click it precedes so one gesture
 * never both swipes *and* taps.
 *
 * Under reduced motion the drag still navigates on release, but the
 * follow-the-finger transform is disabled (`dragStyle` is undefined) — the step
 * just swaps, consistent with the reduced-motion step transition.
 */
export function useOneHandedNav({
  onNext,
  onPrevious,
  canNext,
  canPrevious,
  reduced,
}: {
  onNext: () => void;
  onPrevious: () => void;
  canNext: boolean;
  canPrevious: boolean;
  reduced: boolean;
}) {
  const startRef = React.useRef<{ x: number; y: number } | null>(null);
  const axisRef = React.useRef<"horizontal" | "vertical" | null>(null);
  const swipedRef = React.useRef(false);
  const [dragOffset, setDragOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  const reset = React.useCallback(() => {
    startRef.current = null;
    axisRef.current = null;
    setDragging(false);
    setDragOffset(0);
  }, []);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!event.isPrimary || event.button !== 0) return;
      if (isInteractiveShortcutTarget(event.target)) return;
      startRef.current = { x: event.clientX, y: event.clientY };
      axisRef.current = null;
      swipedRef.current = false;
    },
    [],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const start = startRef.current;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;

      // Lock the gesture axis once the finger clears the slop. A mostly vertical
      // drag stays a native scroll; a horizontal one becomes step navigation.
      if (axisRef.current === null) {
        if (Math.abs(dx) < AXIS_SLOP && Math.abs(dy) < AXIS_SLOP) return;
        axisRef.current =
          Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
        // Any committed drag (either axis) is never also a tap.
        swipedRef.current = true;
        if (axisRef.current === "horizontal") {
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* pointer capture is best-effort */
          }
          if (!reduced) setDragging(true);
        }
      }

      if (axisRef.current !== "horizontal") return;
      // Own the horizontal gesture so the browser doesn't scroll or select.
      event.preventDefault();
      if (reduced) return; // navigate on release, but no follow-the-finger

      const blocked = (dx > 0 && !canPrevious) || (dx < 0 && !canNext);
      setDragOffset(blocked ? Math.sign(dx) * rubberBand(Math.abs(dx)) : dx);
    },
    [canNext, canPrevious, reduced],
  );

  const finishPointer = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const start = startRef.current;
      const wasHorizontal = axisRef.current === "horizontal";
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* nothing captured */
      }
      reset();
      if (!start || !wasHorizontal) return;
      const direction = resolveSwipe(
        event.clientX - start.x,
        event.clientY - start.y,
      );
      if (direction === "next" && canNext) onNext();
      else if (direction === "previous" && canPrevious) onPrevious();
    },
    [canNext, canPrevious, onNext, onPrevious, reset],
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

  const dragStyle: React.CSSProperties | undefined = reduced
    ? undefined
    : {
        transform: `translateX(${dragOffset}px)`,
        transition: dragging ? "none" : "transform 0.2s var(--ease-standard)",
      };

  return {
    onClick,
    onPointerDown,
    onPointerMove,
    onPointerUp: finishPointer,
    onPointerCancel: finishPointer,
    dragStyle,
    dragging,
  };
}
