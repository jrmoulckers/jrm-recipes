'use client';

import * as React from 'react';
import { Star } from 'lucide-react';

import { cn } from '~/lib/utils';
import { useReducedMotion } from '~/lib/use-reduced-motion';

const STARS = [1, 2, 3, 4, 5];

export type StarRatingProps = {
  /** The committed rating, 0 (or null) when unrated. */
  value: number | null;
  /** Omit to render a read-only display row. */
  onChange?: (value: number) => void;
  /** Accessible name for the star group. */
  label: string;
  /** Accessible name for each star button, e.g. `Rate 3 stars`. */
  starLabel?: (value: number) => string;
  disabled?: boolean;
  /** Tailwind size utility for each star glyph. */
  size?: string;
  /**
   * A just-committed value, bumped by `key` on every commit, that punctuates the
   * fill with a left-to-right staggered pop. Null keeps hover, mount, and
   * clearing silent.
   */
  commit?: { value: number; key: number } | null;
  className?: string;
};

/**
 * The one interactive star row (#1010). Every place a member can set stars —
 * the recipe ratings & reviews card, the Cook Mode completion moment — renders
 * this, so the hover/focus preview fill behaves identically everywhere instead
 * of existing in one control and not the others.
 *
 * Preview is deliberately *visual only*: hovering paints stars up to the
 * pointer but never announces or commits a value, so assistive tech and the
 * `aria-pressed` state still describe the committed rating.
 */
export function StarRating({
  value,
  onChange,
  label,
  starLabel,
  disabled = false,
  size = 'size-6',
  commit = null,
  className,
}: StarRatingProps) {
  const [preview, setPreview] = React.useState<number | null>(null);
  const reducedMotion = useReducedMotion();
  const interactive = Boolean(onChange) && !disabled;
  const committed = value ?? 0;
  const displayed = interactive ? (preview ?? committed) : committed;

  const stars = STARS.map((n) => {
    const active = displayed >= n;
    const popping = !reducedMotion && commit != null && n <= commit.value;
    return (
      <Star
        key={popping ? `pop-${commit.key}-${n}` : `star-${n}`}
        style={popping ? { animationDelay: `${(n - 1) * 60}ms` } : undefined}
        className={cn(
          size,
          'transition-colors duration-fast motion-reduce:transition-none',
          popping && 'motion-safe:animate-star-pop',
          active ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-muted-foreground',
        )}
        aria-hidden
      />
    );
  });

  if (!onChange) {
    return (
      <span className={cn('flex items-center gap-0.5', className)} aria-label={label} role="img">
        {stars}
      </span>
    );
  }

  return (
    <div
      className={cn('flex items-center gap-0.5', className)}
      role="group"
      aria-label={label}
      onMouseLeave={() => setPreview(null)}
    >
      {STARS.map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          aria-label={starLabel?.(n) ?? `${n}`}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          onMouseEnter={() => interactive && setPreview(n)}
          onFocus={() => interactive && setPreview(n)}
          onBlur={() => setPreview(null)}
          className={cn(
            'rounded-full p-1 transition-transform duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
            interactive && 'hover:scale-110',
            !interactive && 'cursor-default',
          )}
        >
          {stars[n - 1]}
        </button>
      ))}
    </div>
  );
}
