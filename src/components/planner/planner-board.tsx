"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
import { friendlyError } from "~/lib/error-copy";

import {
  addEntryAction,
  addMealWithLeftoversAction,
  removeEntryAction,
} from "~/server/planner/actions";
import { logCookAction } from "~/server/cooklog/actions";
import { MEAL_SLOTS, type MealSlotValue } from "~/server/planner/validation";
import { cookTimestampForParam } from "~/server/planner/week";
import { cn } from "~/lib/utils";
import { parseLeftoversNote } from "~/lib/planner-batch";
import { ALLERGEN_LABELS, type Allergen } from "~/lib/allergens";
import {
  allergenConflicts,
  type ActiveMemberOption,
} from "~/lib/dietary-match";
import { useActiveMemberStore } from "~/lib/active-member-store";
import { formatList } from "~/lib/i18n-format";
import { formatPlanWarnings } from "~/lib/plan-safety-copy";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { NativeSelect } from "~/components/ui/native-select";
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
  plannedServings: number | null;
  servingsMade: number | null;
  leftoverSourceId: string | null;
  /** Who planned this entry. It is shown on the shared group board (#363). */
  author?: { id: string; name: string } | null;
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
  defaultServings: number | null;
  lastServings: number | null;
};

type Cell = { dateParam: string; slot: MealSlotValue; dayLabel: string };
type DraftAllocation = {
  id: number;
  date: string;
  slot: MealSlotValue;
  servings: string;
};

/** Compatibility metadata for pre-allocation batch entries from issue #380. */
type LegacyBatchBadge = {
  multiple: 2 | 3;
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
  groupId = null,
}: {
  days: BoardDay[];
  entries: BoardEntry[];
  recipes: BoardRecipe[];
  /** Family profiles, to flag entries unsafe for the active member (#432). */
  members?: ActiveMemberOption[];
  /** When set, the board is a shared group plan: new entries are tagged with
   * this group and cards show their author (#363). */
  groupId?: string | null;
}) {
  const t = useTranslations("planner.board");
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

  const allocationsBySourceId = React.useMemo(() => {
    const map = new Map<string, BoardEntry[]>();
    for (const entry of entries) {
      if (!entry.leftoverSourceId) continue;
      const allocations = map.get(entry.leftoverSourceId);
      if (allocations) allocations.push(entry);
      else map.set(entry.leftoverSourceId, [entry]);
    }
    return map;
  }, [entries]);

  // Keep old note-encoded batch entries readable until they are edited/replaced.
  const legacyLeftoversByRecipeId = React.useMemo(() => {
    const map = new Map<string, BoardEntry>();
    for (const entry of entries) {
      if (
        entry.recipe &&
        parseLeftoversNote(entry.note) &&
        !map.has(entry.recipe.id)
      ) {
        map.set(entry.recipe.id, entry);
      }
    }
    return map;
  }, [entries]);

  const dayLabelByParam = React.useMemo(
    () => new Map(days.map((day) => [day.dateParam, day.weekdayLabel])),
    [days],
  );

  function legacyBatchFor(entry: BoardEntry): LegacyBatchBadge | undefined {
    if (
      !entry.recipe ||
      entry.leftoverSourceId ||
      parseLeftoversNote(entry.note)
    ) {
      return undefined;
    }
    const link = legacyLeftoversByRecipeId.get(entry.recipe.id);
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
                <span className="bg-primary/12 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {t("today")}
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
                      {t(`mealSlot.${slot}`)}
                    </p>

                    {cellEntries.map((entry) => (
                      <EntryChip
                        key={entry.id}
                        entry={entry}
                        avoidAllergens={avoidAllergens}
                        leftovers={
                          entry.recipe != null &&
                          (entry.leftoverSourceId != null ||
                            parseLeftoversNote(entry.note) != null)
                        }
                        allocations={allocationsBySourceId.get(entry.id) ?? []}
                        legacyBatch={legacyBatchFor(entry)}
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
                      aria-label={t("a11y.addToSlot", {
                        slot: t(`mealSlot.${slot}`),
                        day: day.fullLabel,
                      })}
                    >
                      <Plus className="size-3.5" />
                      {t("add")}
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
        groupId={groupId}
        onClose={() => setActiveCell(null)}
      />
    </>
  );
}

function EntryChip({
  entry,
  avoidAllergens,
  leftovers = false,
  allocations,
  legacyBatch,
}: {
  entry: BoardEntry;
  avoidAllergens: Allergen[];
  leftovers?: boolean;
  allocations: BoardEntry[];
  legacyBatch?: LegacyBatchBadge;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("planner.board");
  const [isPending, startTransition] = React.useTransition();
  const [isCooking, startCooking] = React.useTransition();
  const [cooked, setCooked] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  function removeEntries(alsoLeftovers: boolean) {
    startTransition(async () => {
      const results =
        alsoLeftovers && allocations.length > 0
          ? [
              await removeEntryAction({
                entryId: entry.id,
                removeAllocations: true,
              }),
            ]
          : alsoLeftovers && legacyBatch
            ? await Promise.all([
                removeEntryAction({ entryId: legacyBatch.leftoversEntryId }),
                removeEntryAction({ entryId: entry.id }),
              ])
            : [await removeEntryAction({ entryId: entry.id })];
      const failed = results.find((result) => !result.ok);
      if (failed && !failed.ok) {
        toast.error(friendlyError(failed.error));
      } else {
        toast.success(
          alsoLeftovers && (allocations.length > 0 || legacyBatch)
            ? t("toast.removedMealAndLeftovers")
            : t("toast.removedFromPlan"),
        );
        router.refresh();
      }
      setConfirmOpen(false);
    });
  }

  function onRemoveClick() {
    if (allocations.length > 0 || legacyBatch) setConfirmOpen(true);
    else removeEntries(false);
  }

  function cookedIt() {
    if (cooked || !entry.recipe) return;
    const recipe = entry.recipe;
    startCooking(async () => {
      const result = await logCookAction({
        recipeId: recipe.id,
        recipeSlug: recipe.slug,
        cookedAt: cookTimestampForParam(entry.dateParam).toISOString(),
        ...(entry.servingsMade != null
          ? { servingsMade: entry.servingsMade }
          : {}),
      });
      if (result.ok) {
        setCooked(true);
        toast.success(t("toast.loggedToJournal"));
        router.refresh();
      } else {
        toast.error(friendlyError(result.error));
      }
    });
  }

  const title = entry.recipe?.title ?? entry.note ?? t("untitled");
  const alerts = allergenConflicts(
    avoidAllergens,
    entry.recipe?.allergens ?? [],
  );
  const alertText =
    alerts.length > 0
      ? t("allergenContains", {
          allergens: formatList(
            alerts.map((a) => ALLERGEN_LABELS[a].toLowerCase()),
            locale,
          ),
        })
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
                {t("leftovers")}
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
            {entry.author ? (
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {entry.author.name}
              </span>
            ) : null}
            {entry.plannedServings != null && (
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {t("servings", { count: entry.plannedServings })}
              </span>
            )}
            {alertText && (
              <span
                className="mt-1 flex items-center gap-1 font-medium text-foreground"
                title={t("allergenTitle")}
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
            aria-label={t("a11y.removeFromPlan", { title })}
            className="rounded p-0.5 text-muted-foreground opacity-70 transition-opacity hover:text-destructive hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>

        {entry.recipe && !leftovers && (
          <div className="flex flex-wrap items-center gap-1.5">
            {allocations.length > 0 && entry.servingsMade != null && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-accent/50 px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground"
                title={t("servingPlan.summaryTitle", {
                  total: entry.servingsMade,
                  meals: allocations.length + 1,
                })}
              >
                <Repeat className="size-3.5" aria-hidden />
                {t("servingPlan.summary", {
                  total: entry.servingsMade,
                  allocationTotal: allocations.reduce(
                    (total, allocation) =>
                      total + (allocation.plannedServings ?? 0),
                    0,
                  ),
                })}
              </span>
            )}
            {legacyBatch && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-accent/50 px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground"
                title={
                  legacyBatch.dayLabel
                    ? t("batch.titleWithDay", {
                        multiple: legacyBatch.multiple,
                        day: legacyBatch.dayLabel,
                      })
                    : t("batch.titleWithoutDay", {
                        multiple: legacyBatch.multiple,
                      })
                }
              >
                <Repeat className="size-3.5" aria-hidden />
                {t("batch.badge", { multiple: legacyBatch.multiple })}
                {legacyBatch.dayLabel ? ` · ${legacyBatch.dayLabel}` : ""}
              </span>
            )}
            {cooked ? (
              <span className="inline-flex w-fit items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                <CheckCircle2 className="size-3.5" aria-hidden />
                {t("cooked")}
              </span>
            ) : (
              <button
                type="button"
                onClick={cookedIt}
                disabled={isCooking}
                className="inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground opacity-0 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 group-hover:opacity-100 motion-reduce:opacity-100"
              >
                <CheckCircle2 className="size-3.5" aria-hidden />
                {isCooking ? t("logging") : t("cookedIt")}
              </button>
            )}
          </div>
        )}
      </div>

      {(allocations.length > 0 || legacyBatch) && (
        <Dialog
          open={confirmOpen}
          onOpenChange={(open) => !open && setConfirmOpen(false)}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("removeBatch.title")}</DialogTitle>
              <DialogDescription>
                {allocations.length > 0
                  ? t("removeServingPlan.description", {
                      meals: allocations.length + 1,
                    })
                  : legacyBatch?.dayLabel
                    ? t("removeBatch.descriptionWithDay", {
                        day: legacyBatch.dayLabel,
                      })
                    : t("removeBatch.descriptionWithoutDay")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => removeEntries(false)}
                disabled={isPending}
              >
                {t("removeBatch.justThis")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => removeEntries(true)}
                disabled={isPending}
              >
                {allocations.length > 0
                  ? t("removeServingPlan.removeAll", {
                      meals: allocations.length + 1,
                    })
                  : t("removeBatch.removeBoth")}
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
  groupId = null,
  onClose,
}: {
  cell: Cell | null;
  recipes: BoardRecipe[];
  days: BoardDay[];
  groupId?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("planner.board");
  const noteId = React.useId();
  const searchId = React.useId();
  const mealServingsId = React.useId();
  const allocationBaseId = React.useId();
  const nextAllocationId = React.useRef(0);
  const [isPending, startTransition] = React.useTransition();
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [mealServings, setMealServings] = React.useState("4");
  const [allocations, setAllocations] = React.useState<DraftAllocation[]>([]);

  const selectedRecipe =
    recipes.find((recipe) => recipe.id === selectedId) ?? null;
  const allocationCells = React.useMemo(
    () =>
      cell
        ? days.flatMap((day) =>
            MEAL_SLOTS.filter(
              (slot) =>
                day.dateParam > cell.dateParam ||
                (day.dateParam === cell.dateParam &&
                  MEAL_SLOTS.indexOf(slot) > MEAL_SLOTS.indexOf(cell.slot)),
            ).map((slot) => ({ date: day.dateParam, slot })),
          )
        : [],
    [cell, days],
  );
  const allocationDates = React.useMemo(
    () =>
      days.filter((day) =>
        allocationCells.some((option) => option.date === day.dateParam),
      ),
    [allocationCells, days],
  );

  React.useEffect(() => {
    if (cell) {
      setQuery("");
      setSelectedId(null);
      setNote("");
      setError(null);
      setMealServings("4");
      setAllocations([]);
      nextAllocationId.current = 0;
    }
  }, [cell]);

  function selectRecipe(recipe: BoardRecipe, selected: boolean) {
    if (selected) {
      setSelectedId(null);
      setAllocations([]);
      return;
    }
    const preferred = recipe.lastServings ?? recipe.defaultServings ?? 4;
    setSelectedId(recipe.id);
    setMealServings(String(Math.max(1, preferred)));
    setAllocations([]);
    setError(null);
  }

  function addAllocation() {
    if (!cell) return;
    const used = new Set(
      allocations.map((allocation) => `${allocation.date}|${allocation.slot}`),
    );
    const available = allocationCells.filter(
      (option) => !used.has(`${option.date}|${option.slot}`),
    );
    const preferred =
      available.find(
        (option) => option.date > cell.dateParam && option.slot === cell.slot,
      ) ?? available[0];
    if (!preferred) {
      setError(t("validation.noMoreMeals"));
      return;
    }
    setAllocations((current) => [
      ...current,
      {
        id: nextAllocationId.current++,
        date: preferred.date,
        slot: preferred.slot,
        servings: "1",
      },
    ]);
    setError(null);
  }

  function updateAllocation(
    id: number,
    update: Partial<Omit<DraftAllocation, "id">>,
  ) {
    setAllocations((current) =>
      current.map((allocation) =>
        allocation.id === id ? { ...allocation, ...update } : allocation,
      ),
    );
  }

  function updateAllocationDate(id: number, date: string) {
    const slots = allocationCells
      .filter((option) => option.date === date)
      .map((option) => option.slot);
    setAllocations((current) =>
      current.map((allocation) =>
        allocation.id === id
          ? {
              ...allocation,
              date,
              slot: slots.includes(allocation.slot)
                ? allocation.slot
                : (slots[0] ?? allocation.slot),
            }
          : allocation,
      ),
    );
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
      setError(t("validation.pickRecipeOrNote"));
      return;
    }

    const parsedMealServings = Number(mealServings);
    if (
      selectedId &&
      (!Number.isInteger(parsedMealServings) ||
        parsedMealServings < 1 ||
        parsedMealServings > 100000)
    ) {
      setError(t("validation.enterServings"));
      return;
    }
    const parsedAllocations = allocations.map((allocation) => ({
      date: allocation.date,
      slot: allocation.slot,
      servings: Number(allocation.servings),
    }));
    if (
      parsedAllocations.some(
        (allocation) =>
          !Number.isInteger(allocation.servings) ||
          allocation.servings < 1 ||
          allocation.servings > 100000,
      )
    ) {
      setError(t("validation.enterServings"));
      return;
    }
    const destinations = new Set<string>();
    for (const allocation of parsedAllocations) {
      const destination = `${allocation.date}|${allocation.slot}`;
      if (destination === `${cell.dateParam}|${cell.slot}`) {
        setError(t("validation.pickDifferentMeal"));
        return;
      }
      if (destinations.has(destination)) {
        setError(t("validation.duplicateLeftoverMeal"));
        return;
      }
      destinations.add(destination);
    }
    setError(null);

    startTransition(async () => {
      const result =
        parsedAllocations.length > 0 && selectedId
          ? await addMealWithLeftoversAction({
              date: cell.dateParam,
              slot: cell.slot,
              recipeId: selectedId,
              groupId: groupId ?? undefined,
              note: trimmedNote.length > 0 ? trimmedNote : undefined,
              mealServings: parsedMealServings,
              leftovers: parsedAllocations,
            })
          : await addEntryAction({
              date: cell.dateParam,
              slot: cell.slot,
              recipeId: selectedId ?? undefined,
              groupId: groupId ?? undefined,
              note: trimmedNote.length > 0 ? trimmedNote : undefined,
              servings: selectedId ? parsedMealServings : undefined,
            });

      if (result.ok) {
        toast.success(
          parsedAllocations.length > 0
            ? t("toast.addedWithLeftovers")
            : t("toast.addedToPlan"),
        );
        const warning = formatPlanWarnings(result.warnings ?? [], locale);
        if (warning) {
          toast.warning(warning);
        }
        onClose();
        router.refresh();
      } else {
        setError(result.error);
        toast.error(friendlyError(result.error));
      }
    });
  }

  return (
    <Dialog open={cell != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {cell && (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {t("dialog.title", { slot: t(`mealSlot.${cell.slot}`) })}
              </DialogTitle>
              <DialogDescription>{cell.dayLabel}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor={searchId}>{t("dialog.recipeLabel")}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id={searchId}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("dialog.searchPlaceholder")}
                  className="ps-9"
                  autoComplete="off"
                />
              </div>

              <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                {recipes.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {t("empty.noRecipes")}
                  </p>
                ) : filtered.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {t("empty.noRecipeMatches", { query })}
                  </p>
                ) : (
                  <ul className="divide-y divide-border/70">
                    {filtered.map((recipe) => {
                      const selected = selectedId === recipe.id;
                      return (
                        <li key={recipe.id}>
                          <button
                            type="button"
                            onClick={() => selectRecipe(recipe, selected)}
                            className={cn(
                              "flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
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
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-1 block">
                                {recipe.title}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {recipe.lastServings != null
                                  ? t("servingPlan.lastUsed", {
                                      count: recipe.lastServings,
                                    })
                                  : t("servingPlan.recipeDefault", {
                                      count: recipe.defaultServings ?? 4,
                                    })}
                              </span>
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
                {t("dialog.noteLabel")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("optional")}
                </span>
              </Label>
              <Textarea
                id={noteId}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("dialog.notePlaceholder")}
                rows={2}
                maxLength={300}
              />
            </div>

            {selectedRecipe && (
              <section className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <div>
                  <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Repeat className="size-4 text-primary" aria-hidden />
                    {t("servingPlan.title")}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selectedRecipe.lastServings != null
                      ? t("servingPlan.lastUsedDetail", {
                          count: selectedRecipe.lastServings,
                        })
                      : t("servingPlan.recipeDefaultDetail", {
                          count: selectedRecipe.defaultServings ?? 4,
                        })}
                  </p>
                </div>

                <div className="grid gap-1.5 sm:max-w-48">
                  <Label htmlFor={mealServingsId}>
                    {t("servingPlan.thisMealLabel")}
                  </Label>
                  <Input
                    id={mealServingsId}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100000}
                    value={mealServings}
                    onChange={(event) => setMealServings(event.target.value)}
                  />
                </div>

                {allocations.map((allocation, index) => {
                  const dateId = `${allocationBaseId}-date-${allocation.id}`;
                  const slotId = `${allocationBaseId}-slot-${allocation.id}`;
                  const servingsId = `${allocationBaseId}-servings-${allocation.id}`;
                  const allocationSlots = allocationCells
                    .filter((option) => option.date === allocation.date)
                    .map((option) => option.slot);
                  return (
                    <fieldset
                      key={allocation.id}
                      className="grid gap-2 border-t border-border/70 pt-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_6rem_auto]"
                    >
                      <legend className="sr-only">
                        {t("servingPlan.allocation", { number: index + 1 })}
                      </legend>
                      <div className="grid gap-1.5">
                        <Label htmlFor={dateId}>
                          {t("servingPlan.dateLabel")}
                        </Label>
                        <NativeSelect
                          id={dateId}
                          value={allocation.date}
                          onChange={(event) =>
                            updateAllocationDate(
                              allocation.id,
                              event.target.value,
                            )
                          }
                        >
                          {allocationDates.map((day) => (
                            <option key={day.dateParam} value={day.dateParam}>
                              {day.fullLabel}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={slotId}>
                          {t("servingPlan.mealLabel")}
                        </Label>
                        <NativeSelect
                          id={slotId}
                          value={allocation.slot}
                          onChange={(event) =>
                            updateAllocation(allocation.id, {
                              slot: event.target.value as MealSlotValue,
                            })
                          }
                        >
                          {allocationSlots.map((slot) => (
                            <option key={slot} value={slot}>
                              {t(`mealSlot.${slot}`)}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={servingsId}>
                          {t("servingPlan.servingsLabel")}
                        </Label>
                        <Input
                          id={servingsId}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={100000}
                          value={allocation.servings}
                          onChange={(event) =>
                            updateAllocation(allocation.id, {
                              servings: event.target.value,
                            })
                          }
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setAllocations((current) =>
                            current.filter((item) => item.id !== allocation.id),
                          )
                        }
                        aria-label={t("servingPlan.removeAllocation", {
                          number: index + 1,
                        })}
                        className="self-end rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </fieldset>
                  );
                })}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addAllocation}
                    disabled={allocations.length >= allocationCells.length}
                  >
                    <Plus aria-hidden />
                    {t("servingPlan.addAllocation")}
                  </Button>
                  <p
                    className="text-sm font-semibold text-foreground"
                    aria-live="polite"
                  >
                    {t("servingPlan.total", {
                      count:
                        (Number(mealServings) || 0) +
                        allocations.reduce(
                          (total, allocation) =>
                            total + (Number(allocation.servings) || 0),
                          0,
                        ),
                    })}
                  </p>
                </div>
              </section>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? t("adding") : t("addToPlan")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PlannerEmptyState({
  groupName = null,
}: {
  groupName?: string | null;
}) {
  const t = useTranslations("planner.board");
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface/50 py-14 text-center">
      <span className="bg-primary/12 inline-flex size-14 items-center justify-center rounded-2xl text-primary">
        <UtensilsCrossed className="size-6" aria-hidden="true" />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">
        {groupName ? (
          <>
            {t("empty.groupPrefix")}{" "}
            <span className="font-medium text-foreground">{groupName}</span>{" "}
            {t("empty.groupMiddle")}{" "}
            <span className="font-medium text-foreground">{t("add")}</span>{" "}
            {t("empty.groupSuffix")}
          </>
        ) : (
          <>
            {t("empty.soloPrefix")}{" "}
            <span className="font-medium text-foreground">{t("add")}</span>{" "}
            {t("empty.soloSuffix")}
          </>
        )}
      </p>
    </div>
  );
}
