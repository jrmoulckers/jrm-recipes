"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "~/lib/utils";

/**
 * Toggle switch. Its dimensions are driven by `--control-scale` (see
 * themes.css) so the pill, thumb, and checked travel all grow together in the
 * large-target modes (Kids/Simple); at the default scale of 1 the classes
 * resolve to the original h-6 / w-11 / size-5 / translate-x-5. Height also
 * meets `--tap-min` via the global `button` rule in globals.css. The 2px
 * (0.25rem across both borders) offset is preserved, which is why the checked
 * translate subtracts 0.25rem to stay flush at every scale.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-[calc(1.5rem*var(--control-scale))] w-[calc(2.75rem*var(--control-scale))] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block size-[calc(1.25rem*var(--control-scale))] rounded-full bg-background shadow-token ring-0 transition-transform data-[state=checked]:translate-x-[calc(1.5rem*var(--control-scale)_-_0.25rem)] data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
