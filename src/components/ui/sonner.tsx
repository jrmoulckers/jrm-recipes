"use client";

import { useTheme } from "~/components/theme/theme-provider";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** App-wide toast host, themed to match the active color scheme. */
export function Toaster(props: ToasterProps) {
  const { resolvedScheme } = useTheme();
  return (
    <Sonner
      theme={resolvedScheme}
      className="toaster group"
      // A keyboard-reachable dismiss affordance on every toast so error messages
      // (which should linger) can be closed on demand instead of only timing out.
      closeButton
      // Give feedback long enough to read; errors typically linger longer than
      // this default and callers can still override per-toast.
      duration={5000}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-token-lg group-[.toaster]:rounded-xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton:
            "group-[.toast]:bg-popover group-[.toast]:text-muted-foreground group-[.toast]:border-border group-[.toast]:hover:text-foreground",
        },
      }}
      {...props}
    />
  );
}
