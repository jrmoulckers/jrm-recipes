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
          // Match the app-wide CloseButton: a calm, circular affordance with the
          // shared hover and focus ring, instead of Sonner's stock bordered nub.
          closeButton:
            "group-[.toast]:size-6 group-[.toast]:rounded-full group-[.toast]:border-0 group-[.toast]:bg-transparent group-[.toast]:text-muted-foreground group-[.toast]:shadow-none group-[.toast]:transition-colors group-[.toast]:hover:bg-muted group-[.toast]:hover:text-foreground group-[.toast]:focus-visible:outline-none group-[.toast]:focus-visible:ring-2 group-[.toast]:focus-visible:ring-ring group-[.toast]:focus-visible:ring-offset-2 group-[.toast]:focus-visible:ring-offset-popover",
        },
      }}
      {...props}
    />
  );
}
