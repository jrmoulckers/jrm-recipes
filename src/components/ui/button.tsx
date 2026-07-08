import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";
import { Spinner } from "./spinner";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium ring-offset-background transition-[background,color,box-shadow,transform] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-[1.1em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-token hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        accent: "bg-accent text-accent-foreground shadow-token hover:bg-accent/90",
        outline:
          "border border-input bg-transparent hover:bg-muted hover:text-foreground",
        ghost: "hover:bg-muted hover:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-token hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        default: "h-11 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        xl: "h-14 px-8 text-lg",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Show a spinner, mark the button `aria-busy`, and block interaction without
   * the "unavailable" dim of `disabled`. The label stays mounted and in the
   * accessibility tree — hidden with `opacity-0`, never `visibility:hidden`,
   * which would drop it from the accessible-name computation — so the button
   * keeps both its accessible name and the exact same width between idle and
   * loading.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          // Keep the spinner readable (no disabled dim) and give the overlay a
          // positioning context while loading.
          loading && "relative disabled:opacity-100",
          asChild && loading && "pointer-events-none",
        )}
        ref={ref}
        data-variant={variant ?? "default"}
        aria-busy={loading || undefined}
        data-loading={loading ? "" : undefined}
        aria-disabled={asChild && loading ? true : undefined}
        {...(asChild ? {} : { disabled: Boolean(disabled) || loading })}
        {...props}
      >
        {asChild || !loading ? (
          children
        ) : (
          <>
            <span
              className="absolute inset-0 inline-flex items-center justify-center"
              aria-hidden="true"
            >
              <Spinner />
            </span>
            <span className="inline-flex items-center gap-2 opacity-0">
              {children}
            </span>
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
