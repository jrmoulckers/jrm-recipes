"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * Tooltip surface (issue #108). `default` keeps the compact inverted chip
 * unchanged; `soft` swaps to the popover token pair for a gentler look in
 * playful modes. `multiline` opens up a max width + relaxed leading for longer
 * hints. A color-matched arrow (see `ARROW_FILL`) is always rendered so the tip
 * points at its trigger on every side.
 */
const tooltipVariants = cva(
  "z-50 overflow-hidden rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-token-lg data-[state=delayed-open]:animate-fade-in",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background",
        soft: "border border-border bg-popover text-popover-foreground",
      },
      multiline: {
        true: "max-w-xs text-pretty leading-relaxed",
        false: "",
      },
    },
    defaultVariants: { variant: "default", multiline: false },
  },
);

const ARROW_FILL = {
  default: "fill-foreground",
  soft: "fill-popover",
} as const;

export interface TooltipContentProps
  extends
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>,
    VariantProps<typeof tooltipVariants> {}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(
  (
    { className, sideOffset = 4, variant, multiline, children, ...props },
    ref,
  ) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(tooltipVariants({ variant, multiline }), className)}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow
          width={11}
          height={5}
          className={ARROW_FILL[variant ?? "default"]}
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  ),
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  tooltipVariants,
};
