"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";

import { addEntryAction, removeEntryAction } from "~/server/planner/actions";
import { logCookAction } from "~/server/cooklog/actions";
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  type MealSlotValue,
} from "~/server/planner/validation";
import { cn } from "~/lib/utils";
import { ALLERGEN_LABELS, type Allergen } from "~/lib/allergens";
import { allergenConflicts, type ActiveMemberOption } from "~/lib/dietary-match";
import { useActiveMemberStore } from "~/lib/active-member-store";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

export type BoardDay = {
  dateParam: string;
  weekdayLabel: string;
  dayNumber: string;
  fullLabel: string;
  isToday: boolean;
};

export type BoardEntry = {
  id: string;
  dateParam: string;
  slot: MealSlotValue;
  note: string | null;
  recipe: {
    id: string;
    slug: string;
    title: string;
    allergens?: Allergen[];
  } | null;
};

export type BoardRecipe = {
  id: string;
  title: string;
  slug: string;
};

type Cell = { dateParam: string; slot: MealSlotValue; dayLabel: string };

function cellKey(dateParam: string, slot: MealSlotValue) {
  return `${dateParam}|${slot}`;
}

export function PlannerBoard({
  days,
  entries,
  recipes,
  members = [],
}: {
  days: BoardDay[];
  entries: BoardEntry[];
  recipes: BoardRecipe[];
  /** Family profiles, to flag entries unsafe for the active member (#432). */
  members?: ActiveMemberOption[];
}) {
  const [activeCell, setActiveCell] = React.useState<Cell | null>(null);
  const activeMemberId = useActiveMemberStore((s) => s.activeMemberId);
  const avoidAllergens =
    members.find((m) => m.id === activeMemberId)?.allergens ?? [];

  const entriesByCell = React.useMemo(() => {
    const map = new Map<string, BoardEntry[]>();
    for (const entry of entries) {
      const key = cellKey(entry.dateParam, entry.slot);
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    return map;
  }, [entries]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((day) => (
          <section
            key={day.dateParam}
            className={cn(
              "flex flex-col rounded-xl border border-border bg-card shadow-token",
              day.isToday && "border-primary/50 ring-1 ring-primary/30",
            )}
          >
            <header className="flex items-baseline justify-between gap-2 border-b border-border/70 px-3 py-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {day.weekdayLabel}
                </span>
                <span
                  className={cn(
                    "font-display text-lg font-semibold leading-none",
                    day.isToday && "text-primary",
                  )}
                >
                  {day.dayNumber}
                </span>
              </div>
              {day.isToday && (
                <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Today
                </span>
              )}
            </header>

            <div className="flex flex-1 flex-col gap-3 p-3">
              {MEAL_SLOTS.map((slot) => {
                const cellEntries =
                  entriesByCell.get(cellKey(day.dateParam, slot)) ?? [];
                return (
                  <div key={slot} className="flex flex-col gap-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {MEAL_SLOT_LABELS[slot]}
                    </p>

                    {cellEntries.map((entry) => (
                      <EntryChip
                        key={entry.id}
                        entry={entry}
                        avoidAllergens={avoidAllergens}
                      />
                    ))}

                    <button
                      type="button"
                      onClick={() =>
                        setActiveCell({
                          dateParam: day.dateParam,
                          slot,
                          dayLabel: day.fullLabel,
                        })
                      }
                      className="flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Add to ${MEAL_SLOT_LABELS[slot]} on ${day.fullLabel}`}
                    >
                      <Plus className="size-3.5" />
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <AddEntryDialog
        cell={activeCell}
        recipes={recipes}
        onClose={() => setActiveCell(null)}
      />
    </>
  );
}

function EntryChip({
  entry,
  avoidAllergens,
}: {
  entry: BoardEntry;
  avoidAllergens: Allergen[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [isCooking, startCooking] = React.useTransition();
  const [cooked, setCooked] = React.useState(false);

  function remove() {
    startTransition(async () => {
      const result = await removeEntryAction({ entryId: entry.id });
      if (result.ok) {
        toast.success("Removed from your plan.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function cookedIt() {
    if (cooked || !entry.recipe) return;
    const recipe = entry.recipe;
    startCooking(async () => {
      const result = await logCookAction({
        recipeId: recipe.id,
        recipeSlug: recipe.slug,
        cookedAt: entry.dateParam,
      });
      if (result.ok) {
        setCooked(true);
        toast.success("Logged to your journal.");
      } else {
        toast.error(result.error);
      }
    });
  }

  const title = entry.recipe?.title ?? entry.note ?? "Untitled";
  const alerts = allergenConflicts(avoidAllergens, entry.recipe?.allergens ?? []);
  const alertText =
    alerts.length > 0
      ? `Contains ${alerts.map((a) => ALLERGEN_LABELS[a].toLowerCase()).join(", ")}`
      : null;

  return (
    <div
      className={cn(
        "group flex flex-col gap-1 rounded-lg border border-border bg-surface/60 px-2 py-1.5 text-xs",
        isPending && "opacity-50",
        alertText && "border-warning/60 bg-warning/10",
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 flex-1 leading-snug">
          <span className="font-medium text-foreground">{title}</span>
          {entry.recipe && entry.note ? (
            <span className="block text-muted-foreground">{entry.note}</span>
          ) : null}
          {alertText && (
            <span
              className="mt-1 flex items-center gap-1 font-medium text-warning-foreground"
              title="Best-effort from ingredient names — double-check labels and brands."
            >
              <AlertTriangle className="size-3 shrink-0" aria-hidden />
              {alertText}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          aria-label={`Remove ${title} from plan`}
          className="rounded p-0.5 text-muted-foreground opacity-70 transition-opacity hover:text-destructive hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {entry.recipe &&
        (cooked ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Cooked
          </span>
        ) : (
          <button
            type="button"
            onClick={cookedIt}
            disabled={isCooking}
            className="inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground opacity-0 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:cursor-wait disabled:opacity-70 motion-reduce:opacity-100"
          >
            <CheckCircle2 className="size-3.5" aria-hidden />
            {isCooking ? "Logging…" : "Cooked it"}
          </button>
        ))}
    </div>
  );
}

function AddEntryDialog({
  cell,
  recipes,
  onClose,
}: {
  cell: Cell | null;
  recipes: BoardRecipe[];
  onClose: () => void;
}) {
  const router = useRouter();
  const noteId = React.useId();
  const searchId = React.useId();
  const [isPending, startTransition] = React.useTransition();
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (cell) {
      setQuery("");
      setSelectedId(null);
      setNote("");
      setError(null);
    }
  }, [cell]);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = term
      ? recipes.filter((recipe) => recipe.title.toLowerCase().includes(term))
      : recipes;
    return matches.slice(0, 50);
  }, [query, recipes]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cell) return;

    const trimmedNote = note.trim();
    if (!selectedId && trimmedNote.length === 0) {
      setError("Pick a recipe or add a note.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await addEntryAction({
        date: cell.dateParam,
        slot: cell.slot,
        recipeId: selectedId ?? undefined,
        note: trimmedNote.length > 0 ? trimmedNote : undefined,
      });

      if (result.ok) {
        toast.success("Added to your plan.");
        onClose();
        router.refresh();
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={cell != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {cell && (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Add to {MEAL_SLOT_LABELS[cell.slot]}</DialogTitle>
              <DialogDescription>{cell.dayLabel}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor={searchId}>Recipe</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id={searchId}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search your recipes…"
                  className="pl-9"
                  autoComplete="off"
                />
              </div>

              <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                {recipes.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No recipes in your library yet. Add a note below instead.
                  </p>
                ) : filtered.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No recipes match “{query}”.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/70">
                    {filtered.map((recipe) => {
                      const selected = selectedId === recipe.id;
                      return (
                        <li key={recipe.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedId(selected ? null : recipe.id)
                            }
                            className={cn(
                              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                              selected && "bg-primary/10 text-foreground",
                            )}
                            aria-pressed={selected}
                          >
                            <span
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground/40",
                              )}
                            >
                              {selected && <Check className="size-3" />}
                            </span>
                            <span className="line-clamp-1 flex-1">
                              {recipe.title}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor={noteId}>
                Note{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id={noteId}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Leftovers, eat out, prep ahead…"
                rows={2}
                maxLength={300}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Adding…" : "Add to plan"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PlannerEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface/50 py-14 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <UtensilsCrossed className="size-6" aria-hidden="true" />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">
        Nothing planned this week yet. Tap{" "}
        <span className="font-medium text-foreground">Add</span> on any day to
        drop in a recipe or a quick note.
      </p>
    </div>
  );
}
