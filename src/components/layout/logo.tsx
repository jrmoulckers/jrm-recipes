import * as React from "react";

import { cn } from "~/lib/utils";
import { brand } from "~/config/brand";

/**
 * Heirloom mark — a cooking pot cradling a sprig, nodding to heritage + home
 * cooking. Uses theme tokens so it recolors with every UI mode.
 */
export function LogoMark({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-8", className)}
      {...props}
    >
      {/* sprig */}
      <path
        d="M16 12c0-3 1.6-5.2 4-6.4-.2 2.9-1.3 5-4 6.4Z"
        className="fill-secondary"
      />
      <path
        d="M16 12c0-2.6-1.4-4.6-3.8-5.7.1 2.6 1.2 4.5 3.8 5.7Z"
        className="fill-secondary/70"
      />
      {/* pot body */}
      <path
        d="M6 13h20l-1.5 10.2A4 4 0 0 1 20.5 27h-9a4 4 0 0 1-4-3.8L6 13Z"
        className="fill-primary"
      />
      {/* rim + handles */}
      <rect
        x="4.5"
        y="10.5"
        width="23"
        height="3.4"
        rx="1.7"
        className="fill-accent"
      />
      <circle cx="4.6" cy="12.2" r="1.9" className="fill-accent" />
      <circle cx="27.4" cy="12.2" r="1.9" className="fill-accent" />
    </svg>
  );
}

/** Full lockup: mark + wordmark. */
export function Logo({
  className,
  wordmarkClassName,
  showWordmark = true,
}: {
  className?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {showWordmark && (
        <span
          className={cn(
            "font-display text-xl font-semibold tracking-tight",
            wordmarkClassName,
          )}
        >
          {brand.name}
        </span>
      )}
    </span>
  );
}
