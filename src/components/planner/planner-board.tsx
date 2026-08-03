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
  addBatchCookAction,
  addEntryAction,
  removeEntryAction,
} from "~/server/planner/actions";
import { logCookAction } from "~/server/cooklog/actions";
import {
  MEAL_SLOTS,
  type MealSlotValue,
} from "~/server/planner/validation";
import { cn } from "~/lib/utils";
import {
  BATCH_MULTIPLES,
  parseLeftoversNote,
  type BatchMultiple,
} from "~/lib/planner-batch";
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
import { Checkbox } from "~/components/ui/checkbox";
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

  // First leftovers entry per recipe, so a primary can show its batch intent.
  const leftoversByRecipeId = React.useMemo(() => {
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
  batch,
}: {
  entry: BoardEntry;
  avoidAllergens: Allergen[];
  leftovers?: boolean;
  batch?: BatchBadge;
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
      const ids =
        alsoLeftovers && batch
          ? [entry.id, batch.leftoversEntryId]
          : [entry.id];
      const results = await Promise.all(
        ids.map((id) => removeEntryAction({ entryId: id })),
      );
      const failed = results.find((result) => !result.ok);
      if (failed && !failed.ok) {
        toast.error(friendlyError(failed.error));
      } else {
        toast.success(
          alsoLeftovers && batch
            ? t("toast.removedMealAndLeftovers")
            : t("toast.removedFromPlan"),
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
        toast.success(t("toast.loggedToJournal"));
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
            {alertText && (
              <span
                className="mt-1 flex items-center gap-1 font-medium text-warning-foreground"
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
            {batch && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-accent/50 px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground"
                title={
                  batch.dayLabel
                    ? t("batch.titleWithDay", {
                        multiple: batch.multiple,
                        day: batch.dayLabel,
                      })
                    : t("batch.titleWithoutDay", {
                        multiple: batch.multiple,
                      })
                }
              >
                <Repeat className="size-3.5" aria-hidden />
                {t("batch.badge", { multiple: batch.multiple })}
                {batch.dayLabel ? ` · ${batch.dayLabel}` : ""}
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

      {batch && (
        <Dialog
          open={confirmOpen}
          onOpenChange={(open) => !open && setConfirmOpen(false)}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("removeBatch.title")}</DialogTitle>
              <DialogDescription>
                {batch.dayLabel
                  ? t("removeBatch.descriptionWithDay", { day: batch.dayLabel })
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
                {t("removeBatch.removeBoth")}
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
      setError(t("validation.pickRecipeOrNote"));
      return;
    }

    const batching = batchOn && canBatch;
    if (batching && !leftoversDate) {
      setError(t("validation.pickLeftoversNight"));
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
              groupId: groupId ?? undefined,
              note: trimmedNote.length > 0 ? trimmedNote : undefined,
              leftoversDate,
              multiple,
            })
          : await addEntryAction({
              date: cell.dateParam,
              slot: cell.slot,
              recipeId: selectedId ?? undefined,
              groupId: groupId ?? undefined,
              note: trimmedNote.length > 0 ? trimmedNote : undefined,
            });

      if (result.ok) {
        toast.success(
          batching
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
      <DialogContent>
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
                            onClick={() =>
                              setSelectedId(selected ? null : recipe.id)
                            }
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

            {canBatch && (
              <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Checkbox
                    checked={batchOn}
                    onCheckedChange={(value) => toggleBatch(value === true)}
                  />
                  <span className="inline-flex items-center gap-1.5">
                    <Repeat className="size-4 text-primary" aria-hidden />
                    {t("batch.toggle")}
                  </span>
                </label>

                {batchOn && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label>{t("batch.makeLabel")}</Label>
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
                            {t("batch.option", { multiple: value })}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-1.5">
                      <Label htmlFor={leftoversId}>
                        {t("batch.leftoversNightLabel")}
                      </Label>
                      <NativeSelect
                        id={leftoversId}
                        value={leftoversDate}
                        onChange={(event) =>
                          setLeftoversDate(event.target.value)
                        }
                      >
                        {leftoversOptions.map((day) => (
                          <option key={day.dateParam} value={day.dateParam}>
                            {day.fullLabel}
                          </option>
                        ))}
                      </NativeSelect>
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
