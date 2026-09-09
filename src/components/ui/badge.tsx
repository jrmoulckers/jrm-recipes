import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '~/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/12 text-(--badge-ink-primary)',
        secondary: 'border-transparent bg-secondary/15 text-foreground',
        accent: 'border-transparent bg-accent/15 text-foreground',
        success: 'border-transparent bg-success/15 text-(--badge-ink-success)',
        warning: 'border-transparent bg-warning/20 text-foreground',
        info: 'border-transparent bg-info/15 text-(--badge-ink-info)',
        destructive: 'border-transparent bg-destructive/15 text-(--badge-ink-destructive)',
        outline: 'border-border text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
