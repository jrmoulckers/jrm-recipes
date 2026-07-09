import * as React from "react";

import { cn } from "~/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-background px-3.5 py-2 text-base shadow-token-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          // Invalid state (aria-invalid="true") paints a destructive border and
          // focus ring so the error is visible, not just announced (#144).
          "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
