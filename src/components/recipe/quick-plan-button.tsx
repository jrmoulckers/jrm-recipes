"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";

import { addEntryAction } from "~/server/planner/actions";
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  type MealSlotValue,
} from "~/server/planner/validation";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

/** A selectable day in the current planner week for the quick-plan picker. */
export type QuickPlanDay = {
  /** `yyyy-MM-dd` date param passed straight to the planner action. */
  value: string;
  /** Human label, e.g. "Sun, Jul 6". */
  label: string;
};

type QuickPlanButtonProps = {
  recipeId: string;
  recipeTitle: string;
  /** The seven days of the current planner week, in order. */
  days: QuickPlanDay[];
  /** Which day to pre-select — the next empty dinner of the week. */
  defaultDate: string;
  /**
   * `overlay` is the compact round pill floated over a card cover (browse grid);
   * `button` is a labelled action for the "Back in the rotation" rail.
   */
  variant?: "overlay" | "button";
  className?: string;
};

const OVERLAY_CLASSES =
  "inline-flex size-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-token backdrop-blur transition-[color,transform] duration-150 hover:scale-105 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none";

/**
 * Quick "add to this week's plan" control for recipe cards (#379). Opens a small
 * popover to pick a day + meal slot (defaulting to the next empty dinner) and
 * reuses the existing `addEntryAction`, so a busy parent can build the week
 * without leaving the browse grid. Rendered only for signed-in users when a
 * database is configured — the caller gates it and supplies the week's days.
 */
export function QuickPlanButton({
  recipeId,
  recipeTitle,
  days,
  defaultDate,
  variant = "overlay",
  className,
}: QuickPlanButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(defaultDate);
  const [slot, setSlot] = React.useState<MealSlotValue>("dinner");
  const [pending, startTransition] = React.useTransition();

  // Re-sync the default day whenever the week's occupancy changes under us.
  React.useEffect(() => {
    setDate(defaultDate);
  }, [defaultDate]);

  function onOpenChange(next: boolean) {
    if (next) {
      setDate(defaultDate);
      setSlot("dinner");
    }
    setOpen(next);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    startTransition(async () => {
      const result = await addEntryAction({ date, slot, recipeId });
      if (result.ok) {
        const dayLabel = days.find((d) => d.value === date)?.label ?? "your plan";
        toast.success(`Added ${recipeTitle} to ${dayLabel} ${MEAL_SLOT_LABELS[slot].toLowerCase()}.`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const trigger =
    variant === "overlay" ? (
      <button
        type="button"
        aria-label="Add to this week's plan"
        title="Add to this week's plan"
        className={cn(OVERLAY_CLASSES, className)}
      >
        <CalendarPlus className="size-5" />
      </button>
    ) : (
      <Button type="button" variant="outline" size="sm" className={className}>
        <CalendarPlus /> Add to plan
      </Button>
    );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64"
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <p className="text-sm font-medium">Add to this week&apos;s plan</p>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Day
            <select
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {days.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Meal
            <select
              value={slot}
              onChange={(event) => setSlot(event.target.value as MealSlotValue)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {MEAL_SLOTS.map((value) => (
                <option key={value} value={value}>
                  {MEAL_SLOT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm" disabled={pending || days.length === 0}>
            {pending ? "Adding…" : "Add to plan"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
