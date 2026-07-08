"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "~/lib/utils";

/**
 * Range slider. The track thickness and thumb size scale with
 * `--control-scale`, and the Root's `min-h` is floored to `--control-min`
 * (which large-target modes set to `--tap-min`) so the whole interactive strip
 * is easy to hit in Kids/Simple. At the defaults (`--control-scale: 1`,
 * `--control-min: 0px`) the classes resolve to the original h-2 / size-5 and
 * add no extra height, leaving the other modes visually unchanged.
 */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex min-h-[var(--control-min)] w-full touch-none select-none items-center",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-[calc(0.5rem*var(--control-scale))] w-full grow overflow-hidden rounded-full bg-muted">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block size-[calc(1.25rem*var(--control-scale))] rounded-full border-2 border-primary bg-background shadow-token transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
