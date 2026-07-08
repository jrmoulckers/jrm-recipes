import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";
import { Heading, Text } from "./typography";

/**
 * Shared zero-data surface (issue #84). Centres an optional icon, a
 * `font-display` title, a muted description on a constrained measure, and an
 * optional action row — all on tokenized spacing so every empty surface
 * (recipes, collections, meal plan, shopping list, groups) shares one rhythm.
 */
const emptyStateVariants = cva(
  "flex flex-col items-center text-pretty text-center",
  {
    variants: {
      variant: {
        default:
          "gap-4 rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16",
        compact: "gap-3 px-4 py-8",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const emptyStateIconVariants = cva(
  "inline-flex items-center justify-center rounded-2xl bg-primary/12 text-primary",
  {
    variants: {
      variant: {
        default: "size-16 [&_svg]:size-7",
        compact: "size-12 [&_svg]:size-6",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface EmptyStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof emptyStateVariants> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    { className, icon, title, description, action, variant, ...props },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(emptyStateVariants({ variant }), className)}
      {...props}
    >
      {icon ? (
        <span className={emptyStateIconVariants({ variant })} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Heading level={3} size={variant === "compact" ? "h4" : "h3"}>
          {title}
        </Heading>
        {description ? (
          <Text variant="muted" className="mx-auto max-w-md">
            {description}
          </Text>
        ) : null}
      </div>
      {action ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  ),
);
EmptyState.displayName = "EmptyState";

export { EmptyState, emptyStateVariants };
