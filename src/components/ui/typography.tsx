import * as React from "react";

import { cn } from "~/lib/utils";

/**
 * Typographic primitives backed by the tokenized type scale in
 * `tailwind.config.ts` (issue #98). Because the scale is defined in `rem`, every
 * step honours the per-mode `--text-scale` and the a11y text-size axis
 * (`--a11y-text-mult`) automatically — no per-component overrides required.
 */

const HEADING_SIZE = {
  display: "text-display",
  h1: "text-h1",
  h2: "text-h2",
  h3: "text-h3",
  h4: "text-h4",
} as const;

type HeadingLevel = 1 | 2 | 3 | 4;
type HeadingSize = keyof typeof HEADING_SIZE;
type HeadingElement = "h1" | "h2" | "h3" | "h4" | "p" | "div" | "span";

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Semantic heading level; also drives the default visual size. */
  level?: HeadingLevel;
  /** Visual size override, decoupled from the semantic `level`. */
  size?: HeadingSize;
  /** Render as a different element (defaults to `h{level}`). */
  as?: HeadingElement;
}

const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, level = 2, size, as, ...props }, ref) => {
    const Tag = (as ?? `h${level}`) as React.ElementType;
    const visual: HeadingSize = size ?? (`h${level}` as HeadingSize);
    return (
      <Tag
        ref={ref}
        className={cn(
          "text-balance font-display font-semibold text-foreground",
          HEADING_SIZE[visual],
          className,
        )}
        {...props}
      />
    );
  },
);
Heading.displayName = "Heading";

const TEXT_VARIANT = {
  body: "text-body text-foreground",
  muted: "text-body text-muted-foreground",
  small: "text-body-sm text-muted-foreground",
} as const;

type TextVariant = keyof typeof TEXT_VARIANT;
type TextElement = "p" | "span" | "div";

export interface TextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  variant?: TextVariant;
  as?: TextElement;
}

const Text = React.forwardRef<HTMLParagraphElement, TextProps>(
  ({ className, variant = "body", as = "p", ...props }, ref) => {
    const Tag = as as React.ElementType;
    return (
      <Tag
        ref={ref}
        className={cn("text-pretty", TEXT_VARIANT[variant], className)}
        {...props}
      />
    );
  },
);
Text.displayName = "Text";

export { Heading, Text, HEADING_SIZE, TEXT_VARIANT };
