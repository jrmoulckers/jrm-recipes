"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Plus,
  Repeat,
  Search,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";

import {
  addBatchCookAction,
  addEntryAction,
  removeEntryAction,
} from "~/server/planner/actions";
import { logCookAction } from "~/server/cooklog/actions";
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  type MealSlotValue,
} from "~/server/planner/validation";
import { cn } from "~/lib/utils";
import {
  BATCH_MULTIPLES,
  parseLeftoversNote,
  type BatchMultiple,
} from "~/lib/planner-batch";
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

/** Derived batch-cook link shown on a primary entry (#380). */
type BatchBadge = {
  multiple: BatchMultiple;
  dayLabel: string | null;
  leftoversEntryId: string;
};

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

  // First leftovers entry per recipe, so a primary can show its batch intent.
  const leftoversByRecipeId = React.useMemo(() => {
    const map = new Map<string, BoardEntry>();
    for (const entry of entries) {
      if (entry.recipe && parseLeftoversNote(entry.note) && !map.has(entry.recipe.id)) {
        map.set(entry.recipe.id, entry);
      }
    }
    return map;
  }, [entries]);

  const dayLabelByParam = React.useMemo(
    () => new Map(days.map((day) => [day.dateParam, day.weekdayLabel])),
    [days],
  );

  function batchBadgeFor(entry: BoardEntry): BatchBadge | undefined {
    if (!entry.recipe || parseLeftoversNote(entry.note)) return undefined;
    const link = leftoversByRecipeId.get(entry.recipe.id);
    if (!link || link.id === entry.id) return undefined;
    const info = parseLeftoversNote(link.note);
    if (!info) return undefined;
    return {
      multiple: info.multiple,
      dayLabel: dayLabelByParam.get(link.dateParam) ?? null,
      leftoversEntryId: link.id,
    };
  }

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
                        leftovers={
                          entry.recipe != null &&
                          parseLeftoversNote(entry.note) != null
                        }
                        batch={batchBadgeFor(entry)}
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
        days={days}
        onClose={() => setActiveCell(null)}
      />
    </>
  );
}

function EntryChip({
  entry,
  avoidAllergens,
  leftovers = false,
  batch,
}: {
  entry: BoardEntry;
  avoidAllergens: Allergen[];
  leftovers?: boolean;
  batch?: BatchBadge;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [isCooking, startCooking] = React.useTransition();
  const [cooked, setCooked] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  function removeEntries(alsoLeftovers: boolean) {
    startTransition(async () => {
      const ids =
        alsoLeftovers && batch ? [entry.id, batch.leftoversEntryId] : [entry.id];
      const results = await Promise.all(
        ids.map((id) => removeEntryAction({ entryId: id })),
      );
      const failed = results.find((result) => !result.ok);
      if (failed && !failed.ok) {
        toast.error(failed.error);
      } else {
        toast.success(
          alsoLeftovers && batch
            ? "Removed the meal and its leftovers."
            : "Removed from your plan.",
        );
        router.refresh();
      }
      setConfirmOpen(false);
    });
  }

  function onRemoveClick() {
    if (batch) setConfirmOpen(true);
    else removeEntries(false);
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
    <>
      <div
        className={cn(
          "group flex flex-col gap-1 rounded-lg border px-2 py-1.5 text-xs",
          leftovers
            ? "border-dashed border-border bg-muted/40"
            : "border-border bg-surface/60",
          isPending && "opacity-50",
          alertText && "border-warning/60 bg-warning/10",
        )}
      >
        <div className="flex items-start gap-1.5">
          <span className="mt-0.5 flex-1 leading-snug">
            {leftovers && (
              <span className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Repeat className="size-3 shrink-0" aria-hidden />
                Leftovers
              </span>
            )}
            <span
              className={cn(
                "font-medium",
                leftovers ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {title}
            </span>
            {entry.recipe && entry.note && !leftovers ? (
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
            onClick={onRemoveClick}
            disabled={isPending}
            aria-label={`Remove ${title} from plan`}
            className="rounded p-0.5 text-muted-foreground opacity-70 transition-opacity hover:text-destructive hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>

        {entry.recipe && !leftovers && (
          <div className="flex flex-wrap items-center gap-1.5">
            {batch && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-accent/50 px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground"
                title={
                  batch.dayLabel
                    ? `Cook ${batch.multiple}× — leftovers on ${batch.dayLabel}`
                    : `Cook ${batch.multiple}× — extra for leftovers`
                }
              >
                <Repeat className="size-3.5" aria-hidden />
                Batch ×{batch.multiple}
                {batch.dayLabel ? ` · ${batch.dayLabel}` : ""}
              </span>
            )}
            {cooked ? (
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
            )}
          </div>
        )}
      </div>

      {batch && (
        <Dialog
          open={confirmOpen}
          onOpenChange={(open) => !open && setConfirmOpen(false)}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Remove this meal?</DialogTitle>
              <DialogDescription>
                You batch-cooked this with a leftovers night
                {batch.dayLabel ? ` on ${batch.dayLabel}` : ""}. Remove that too,
                or just this meal?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => removeEntries(false)}
                disabled={isPending}
              >
                Just this one
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => removeEntries(true)}
                disabled={isPending}
              >
                Remove both
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function AddEntryDialog({
  cell,
  recipes,
  days,
  onClose,
}: {
  cell: Cell | null;
  recipes: BoardRecipe[];
  days: BoardDay[];
  onClose: () => void;
}) {
  const router = useRouter();
  const noteId = React.useId();
  const searchId = React.useId();
  const leftoversId = React.useId();
  const [isPending, startTransition] = React.useTransition();
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [batchOn, setBatchOn] = React.useState(false);
  const [multiple, setMultiple] = React.useState<BatchMultiple>(2);
  const [leftoversDate, setLeftoversDate] = React.useState("");

  const leftoversOptions = React.useMemo(
    () => (cell ? days.filter((day) => day.dateParam !== cell.dateParam) : []),
    [cell, days],
  );

  React.useEffect(() => {
    if (cell) {
      setQuery("");
      setSelectedId(null);
      setNote("");
      setError(null);
      setBatchOn(false);
      setMultiple(2);
      setLeftoversDate("");
    }
  }, [cell]);

  const canBatch = cell?.slot === "dinner" && selectedId != null;

  function toggleBatch(next: boolean) {
    setBatchOn(next);
    if (next && !leftoversDate && cell) {
      const after = leftoversOptions.find(
        (day) => day.dateParam > cell.dateParam,
      );
      setLeftoversDate((after ?? leftoversOptions[0])?.dateParam ?? "");
    }
  }

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

    const batching = batchOn && canBatch;
    if (batching && !leftoversDate) {
      setError("Pick a night for the leftovers.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const result =
        batching && selectedId
          ? await addBatchCookAction({
              date: cell.dateParam,
              slot: cell.slot,
              recipeId: selectedId,
              note: trimmedNote.length > 0 ? trimmedNote : undefined,
              leftoversDate,
              multiple,
            })
          : await addEntryAction({
              date: cell.dateParam,
              slot: cell.slot,
              recipeId: selectedId ?? undefined,
              note: trimmedNote.length > 0 ? trimmedNote : undefined,
            });

      if (result.ok) {
        toast.success(
          batching ? "Added — leftovers night booked too." : "Added to your plan.",
        );
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

            {canBatch && (
              <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={batchOn}
                    onChange={(event) => toggleBatch(event.target.checked)}
                    className="size-4 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="inline-flex items-center gap-1.5">
                    <Repeat className="size-4 text-primary" aria-hidden />
                    Batch cook — eat again another night
                  </span>
                </label>

                {batchOn && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label>Make</Label>
                      <div className="flex gap-1.5">
                        {BATCH_MULTIPLES.map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setMultiple(value)}
                            aria-pressed={multiple === value}
                            className={cn(
                              "flex-1 rounded-md border px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              multiple === value
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {value}× batch
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-1.5">
                      <Label htmlFor={leftoversId}>Leftovers night</Label>
                      <select
                        id={leftoversId}
                        value={leftoversDate}
                        onChange={(event) => setLeftoversDate(event.target.value)}
                        className="h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {leftoversOptions.map((day) => (
                          <option key={day.dateParam} value={day.dateParam}>
                            {day.fullLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

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
