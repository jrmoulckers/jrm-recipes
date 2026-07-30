"use client";

import * as React from "react";

import { cn } from "~/lib/utils";

type ToggleGroupContextValue = {
  value: string;
  setValue: (value: string) => void;
};

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(
  null,
);

function useToggleGroupContext(component: string) {
  const context = React.useContext(ToggleGroupContext);
  if (!context) {
    throw new Error(`${component} must be used within a <ToggleGroup>.`);
  }
  return context;
}

export interface ToggleGroupProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onChange"
> {
  /** The currently selected item value. */
  value: string;
  /** Called with the next value when a different item is selected. */
  onValueChange: (value: string) => void;
}

/**
 * Standardized single-select segmented control ("toggle group"). Renders a
 * tokenized `bg-muted` track with a raised `bg-card` active thumb so every
 * segmented toggle in the app shares one look, focus ring, and disabled state.
 * Compose it with {@link ToggleGroupItem}.
 */
const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  ({ className, value, onValueChange, children, ...props }, ref) => {
    const context = React.useMemo<ToggleGroupContextValue>(
      () => ({ value, setValue: onValueChange }),
      [value, onValueChange],
    );
    return (
      <ToggleGroupContext.Provider value={context}>
        <div
          ref={ref}
          role="group"
          className={cn(
            "inline-flex items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </ToggleGroupContext.Provider>
    );
  },
);
ToggleGroup.displayName = "ToggleGroup";

export interface ToggleGroupItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** The value this item represents within the group. */
  value: string;
}

const ToggleGroupItem = React.forwardRef<
  HTMLButtonElement,
  ToggleGroupItemProps
>(({ className, value, children, onClick, ...props }, ref) => {
  const { value: groupValue, setValue } =
    useToggleGroupContext("ToggleGroupItem");
  const selected = groupValue === value;
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      data-state={selected ? "on" : "off"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setValue(value);
        }
      }}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        selected
          ? "bg-card text-foreground shadow-token"
          : "hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
ToggleGroupItem.displayName = "ToggleGroupItem";

export { ToggleGroup, ToggleGroupItem };
