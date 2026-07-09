"use client";

import * as React from "react";
import { AlertTriangle, Check, Info, Minus, Plus, Users } from "lucide-react";
import { useLocale } from "next-intl";

import { cn } from "~/lib/utils";
import { HAPTICS, vibrate } from "~/lib/haptics";
import {
  decomposeMeasure,
  deriveScaleFactor,
  displayUnit,
  expandKidUnit,
  formatKidAmount,
  formatQuantity,
  scaleQuantity,
  toSystem,
  toSystemRange,
  toWeight,
} from "~/lib/units";
import {
  computeBakersFormula,
  computeBatchYield,
} from "~/lib/bakers-math";
import { type UnitSystem } from "~/lib/cook-state";
import { formatList } from "~/lib/i18n-format";
import {
  scalingNudge,
  DIETARY_TAG_LABELS,
  type DietaryTag,
} from "~/lib/substitutions";
import {
  detectAllergensForSafety,
  ALLERGEN_LABELS,
  type Allergen,
} from "~/lib/allergens";
import {
  detectIngredientConflict,
  isIngredientConflict,
  type MemberNeeds,
} from "~/lib/dietary-match";
import { useActiveMemberStore } from "~/lib/active-member-store";
import { ingredientIcon } from "~/lib/ingredient-icons";
import { useThemeBehavior } from "~/components/theme/theme-provider";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { IngredientSubstitutions } from "~/components/recipe/ingredient-substitutions";
import { NutritionPanel, type CalorieMember } from "~/components/recipe/nutrition-panel";
import { type Nutrition } from "~/lib/nutrition";

type PanelIngredient = {
  id: string;
  section: string | null;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  item: string;
  note: string | null;
  prep?: string | null;
  stepPosition?: number | null;
  optional: boolean;
};

/**
 * A saved family member, carrying both their calorie goal (for the nutrition
 * panel, #430) and their allergens + diets (for ingredient conflict flagging,
 * #429). A superset of {@link CalorieMember}, so it drops straight into the
 * nutrition panel too.
 */
export type DietaryMember = CalorieMember & {
  allergens: Allergen[];
  diets: DietaryTag[];
};

type System = UnitSystem;

/**
 * Optional controlled-state hook-up. When provided (e.g. by cook mode) the panel
 * becomes controlled so scaling, units, and the checklist can be lifted and
 * persisted; when omitted it manages its own state exactly as before.
 */
export type IngredientsPanelControls = {
  servings: number;
  onServingsChange: (next: number) => void;
  system: System;
  onSystemChange: (next: System) => void;
  checked: ReadonlySet<string>;
  onToggleChecked: (id: string) => void;
  /** When set, the servings were seeded from the saved household size (#399). */
  householdSize?: number | null;
};

function measure(
  q: number | null,
  unit: string | null,
  system: System,
  item: string,
) {
  if (q == null) return { q: null as number | null, unit: unit ?? "" };
  if (system === "original" || !unit) return { q, unit: unit ?? "" };
  if (system === "grams") {
    // Weigh-based cooking (#385): render convertible volumes/masses in grams,
    // leaving count/unknown ingredients (e.g. "1 egg", "pinch") untouched.
    const grams = toWeight(q, unit, item);
    return grams != null ? { q: grams, unit: "g" } : { q, unit };
  }
  const converted = toSystem(q, unit, system);
  return converted ? { q: converted.quantity, unit: converted.unit } : { q, unit };
}

/**
 * Convert a *ranged* amount (min…max) as a coherent whole so both ends land on
 * one shared unit and round together (#51). Converting the max independently via
 * {@link measure} could pick a different friendly unit or rounding for the high
 * end (e.g. "1 cup–1 quart"); routing us/metric through {@link toSystemRange}
 * keeps the range on the low end's unit. Original/grams pass-throughs stay
 * coherent because both ends share one unit already.
 */
function measureRange(
  q: number | null,
  qMax: number | null,
  unit: string | null,
  system: System,
  item: string,
): { q: number | null; qMax: number | null; unit: string } {
  if (q == null) return { q: null, qMax: null, unit: unit ?? "" };
  if (system === "original" || !unit) return { q, qMax, unit: unit ?? "" };
  if (system === "grams") {
    const grams = toWeight(q, unit, item);
    if (grams == null) return { q, qMax, unit };
    const gramsMax = qMax != null ? toWeight(qMax, unit, item) : null;
    return { q: grams, qMax: gramsMax, unit: "g" };
  }
  const range = toSystemRange(q, qMax, unit, system);
  return range
    ? { q: range.quantity, qMax: range.quantityMax, unit: range.unit }
    : { q, qMax, unit };
}

function amountLabel(
  ing: PanelIngredient,
  factor: number,
  system: System,
  locale: string,
  kid = false,
) {
  const q = scaleQuantity(ing.quantity, factor);
  const qMax = scaleQuantity(ing.quantityMax, factor);
  const m = measureRange(q, qMax, ing.unit, system, ing.item);
  const mMax = m.qMax != null ? { q: m.qMax, unit: m.unit } : null;
  if (m.q == null) {
    return {
      number: "",
      unit: kid
        ? expandKidUnit(ing.unit, null, locale)
        : displayUnit(ing.unit, null, locale),
    };
  }
  if (kid) {
    if (mMax?.q != null) {
      const lo = formatKidAmount(m.q, undefined, locale).number;
      const hi = formatKidAmount(mMax.q, m.unit, locale);
      return { number: `${lo} to ${hi.number}`, unit: hi.unit };
    }
    return formatKidAmount(m.q, m.unit, locale);
  }
  const number =
    mMax?.q != null
      ? `${formatQuantity(m.q, m.unit, locale)}–${formatQuantity(mMax.q, m.unit, locale)}`
      : formatQuantity(m.q, m.unit, locale);
  return { number, unit: displayUnit(m.unit, m.q, locale) };
}

/** Whole-gram label for baker's / batch summaries, localized (e.g. "1,250 g"). */
function formatGrams(grams: number, locale: string): string {
  return `${new Intl.NumberFormat(locale).format(Math.round(grams))} g`;
}

/** Baker's percentage: whole numbers at scale, one decimal for small ratios. */
function formatBakersPercent(pct: number): string {
  const rounded = pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return `${rounded}%`;
}

export function IngredientsPanel({
  ingredients,
  baseServings,
  servingsNoun,
  controls,
  nutrition,
  members,
  renderSuggestions,
}: {
  ingredients: PanelIngredient[];
  baseServings: number | null;
  servingsNoun: string | null;
  controls?: IngredientsPanelControls;
  /** Optional per-serving nutrition; renders a facts panel that scales with servings. */
  nutrition?: Nutrition;
  /** Optional saved family members (calorie goals #430 + conflict flags #429). */
  members?: DietaryMember[];
  /** Optional anchored-suggestion slot rendered under each ingredient row (#346). */
  renderSuggestions?: (ingredientId: string, label: string) => React.ReactNode;
}) {
  const canScale = baseServings != null && baseServings > 0;
  const [servingsInternal, setServingsInternal] = React.useState(
    baseServings ?? 1,
  );
  const [systemInternal, setSystemInternal] = React.useState<System>("original");
  const [checkedInternal, setCheckedInternal] = React.useState<Set<string>>(
    new Set(),
  );
  // Gate check-off animations to post-mount so pre-checked items (e.g. a
  // resumed cook session) render statically instead of animating on load.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // "Scale to…" (#390): pin one ingredient to a target amount and derive the
  // scale factor from it, then feed it back through the normal servings lever.
  const [scaleToOpen, setScaleToOpen] = React.useState(false);
  const [pinId, setPinId] = React.useState<string>("");
  const [pinAmount, setPinAmount] = React.useState<string>("");
  const [pinUnit, setPinUnit] = React.useState<string>("");

  // Baker's percentages (#384). Surfaces only when weights are derivable.
  const [bakersView, setBakersView] = React.useState(false);
  // Batch-weight math (#418): total + per-piece portioning.
  const [pieceCount, setPieceCount] = React.useState<string>("");

  const activeMemberId = useActiveMemberStore((s) => s.activeMemberId);
  const setActiveMemberId = useActiveMemberStore((s) => s.setActiveMemberId);
  const locale = useLocale();
  // Kids mode: picture icons (#440) + spelled-out amounts (#447) for pre-readers.
  const { kidSafe } = useThemeBehavior();

  const memberList = members ?? [];
  // The active restriction is only in effect when the cook has explicitly
  // chosen a member — so the list stays clean by default (issue #429).
  const activeMember =
    memberList.find((m) => m.id === activeMemberId) ?? null;
  const memberNeeds: MemberNeeds | null =
    activeMember &&
    (activeMember.allergens.length > 0 || activeMember.diets.length > 0)
      ? { allergens: activeMember.allergens, diets: activeMember.diets }
      : null;
  const cookingForId = React.useId();

  const servings = controls ? controls.servings : servingsInternal;
  const system = controls ? controls.system : systemInternal;
  const checked = controls ? controls.checked : checkedInternal;

  const factor = canScale ? servings / baseServings : 1;

  const householdSize = controls?.householdSize ?? null;
  const scaledToHousehold =
    householdSize != null &&
    canScale &&
    servings === householdSize &&
    householdSize !== baseServings;

  const sections = React.useMemo(() => {
    const map = new Map<string, PanelIngredient[]>();
    for (const ing of ingredients) {
      const key = ing.section ?? "";
      const list = map.get(key) ?? [];
      list.push(ing);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [ingredients]);

  // Displayed amount per ingredient for the current servings/system, plus the
  // set that changed since the last render so only recomputed rows flash.
  const amounts = React.useMemo(() => {
    const map = new Map<string, { number: string; unit: string }>();
    for (const ing of ingredients) {
      map.set(ing.id, amountLabel(ing, factor, system, locale, kidSafe));
    }
    return map;
  }, [ingredients, factor, system, locale, kidSafe]);

  const prevAmountsRef = React.useRef<Map<string, string>>(new Map());

  // Baker's-% formula + batch weight (#384, #418), derived from ingredient
  // weights scaled by the current factor. Null until at least one flour weight
  // (bakers) or any weight (batch) is derivable, so both features hide cleanly.
  const weighed = React.useMemo(
    () =>
      ingredients.map((i) => ({
        item: i.item,
        quantity: i.quantity,
        unit: i.unit,
      })),
    [ingredients],
  );
  const bakersFormula = React.useMemo(
    () => computeBakersFormula(weighed, factor),
    [weighed, factor],
  );
  // A countable yield (e.g. "12 rolls") seeds the divide-into piece count.
  const countableYield =
    servingsNoun && Number.isFinite(servings) && servings > 0
      ? Math.round(servings)
      : null;
  const pieces =
    pieceCount.trim() === "" ? countableYield : Number(pieceCount);
  const batchYield = React.useMemo(
    () => computeBatchYield(weighed, factor, pieces),
    [weighed, factor, pieces],
  );
  // Per-ingredient baker's percentage (weight ÷ total flour), keyed by id.
  const bakersPercentById = React.useMemo(() => {
    const map = new Map<string, number>();
    if (!bakersFormula || bakersFormula.totalFlour <= 0) return map;
    for (const ing of ingredients) {
      const grams = toWeight(
        scaleQuantity(ing.quantity, factor),
        ing.unit,
        ing.item,
      );
      if (grams != null && grams > 0) {
        map.set(ing.id, (grams / bakersFormula.totalFlour) * 100);
      }
    }
    return map;
  }, [ingredients, factor, bakersFormula]);


  const changedAmountIds = React.useMemo(() => {
    const changed = new Set<string>();
    const prev = prevAmountsRef.current;
    for (const [id, { number, unit }] of amounts) {
      const key = `${number}\u0000${unit}`;
      const before = prev.get(id);
      if (before !== undefined && before !== key && number !== "") {
        changed.add(id);
      }
    }
    return changed;
  }, [amounts]);

  React.useEffect(() => {
    const map = prevAmountsRef.current;
    for (const [id, { number, unit }] of amounts) {
      map.set(id, `${number}\u0000${unit}`);
    }
  }, [amounts]);

  // Only animate a check-off when a row actually flips unchecked -> checked in
  // this render. Rows already checked on first paint (a resumed cook session)
  // are absorbed into the seeded ref and never replay their pop/strike motion.
  const prevCheckedRef = React.useRef<Set<string> | null>(null);
  const justCheckedIds = React.useMemo(() => {
    const just = new Set<string>();
    const prev = prevCheckedRef.current;
    if (prev) {
      for (const id of checked) {
        if (!prev.has(id)) just.add(id);
      }
    }
    return just;
  }, [checked]);

  React.useEffect(() => {
    prevCheckedRef.current = new Set(checked);
  }, [checked]);

  function updateServings(next: number) {
    if (controls) controls.onServingsChange(next);
    else setServingsInternal(next);
  }

  function updateSystem(next: System) {
    if (controls) controls.onSystemChange(next);
    else setSystemInternal(next);
  }

  // Ingredients that carry a numeric amount are the only ones we can pin a
  // target to (#390); "1 pinch" or "to taste" fall back gracefully by absence.
  const pinnable = React.useMemo(
    () => ingredients.filter((i) => i.quantity != null && i.quantity > 0),
    [ingredients],
  );
  const pinIngredient =
    pinnable.find((i) => i.id === pinId) ?? pinnable[0] ?? null;
  const pinFactor = pinIngredient
    ? deriveScaleFactor(
        pinIngredient.quantity,
        pinAmount.trim() === "" ? null : Number(pinAmount),
        pinIngredient.unit,
        pinUnit.trim() === "" ? pinIngredient.unit : pinUnit,
      )
    : null;
  const pinServings =
    pinFactor != null && canScale && baseServings
      ? Math.min(1000, Math.max(1, Math.round(baseServings * pinFactor * 100) / 100))
      : null;

  function openScaleTo() {
    const seed = pinnable[0] ?? null;
    setPinId(seed?.id ?? "");
    setPinUnit(seed?.unit ?? "");
    setPinAmount("");
    setScaleToOpen(true);
  }

  function applyScaleTo() {
    if (pinServings == null) return;
    updateServings(pinServings);
    setScaleToOpen(false);
  }

  function toggle(id: string) {
    if (!checked.has(id)) vibrate(HAPTICS.select);
    if (controls) {
      controls.onToggleChecked(id);
      return;
    }
    setCheckedInternal((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {canScale ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Fewer servings"
              onClick={() => updateServings(Math.max(1, servings - 1))}
            >
              <Minus />
            </Button>
            <div className="min-w-24 text-center">
              <div className="overflow-hidden font-display text-xl font-semibold tabular-nums">
                <span
                  key={servings}
                  className={cn(
                    "inline-block",
                    mounted && "motion-safe:animate-number-roll",
                  )}
                >
                  {formatQuantity(servings, undefined, locale)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {servingsNoun ?? "servings"}
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="More servings"
              onClick={() => updateServings(Math.min(1000, servings + 1))}
            >
              <Plus />
            </Button>
            {servings !== baseServings && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => updateServings(baseServings)}
              >
                Reset
              </Button>
            )}
            {pinnable.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-expanded={scaleToOpen}
                onClick={() =>
                  scaleToOpen ? setScaleToOpen(false) : openScaleTo()
                }
              >
                Scale to…
              </Button>
            )}
            {bakersFormula && (
              <Button
                type="button"
                size="sm"
                variant={bakersView ? "secondary" : "ghost"}
                aria-pressed={bakersView}
                onClick={() => setBakersView((v) => !v)}
              >
                Baker&apos;s %
              </Button>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Ingredients</span>
        )}

        <div
          role="group"
          aria-label="Measurement system"
          className="inline-flex rounded-lg border border-border p-0.5 text-sm"
        >
          {(["original", "us", "metric", "grams"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => updateSystem(s)}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium capitalize transition-colors",
                system === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "us" ? "US" : s}
            </button>
          ))}
        </div>
      </div>

      {scaleToOpen && pinIngredient && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface/50 px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyScaleTo();
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Ingredient
            <select
              value={pinIngredient.id}
              onChange={(e) => {
                const next = pinnable.find((i) => i.id === e.target.value);
                setPinId(e.target.value);
                setPinUnit(next?.unit ?? "");
              }}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {pinnable.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.item}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Target amount
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={pinAmount}
              onChange={(e) => setPinAmount(e.target.value)}
              placeholder={formatQuantity(
                pinIngredient.quantity ?? 0,
                undefined,
                locale,
              )}
              className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-sm font-medium text-foreground"
            />
          </label>
          {pinIngredient.unit && (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Unit
              <input
                type="text"
                value={pinUnit}
                onChange={(e) => setPinUnit(e.target.value)}
                className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-sm font-medium text-foreground"
              />
            </label>
          )}
          <Button type="submit" size="sm" disabled={pinServings == null}>
            Apply
          </Button>
          <p className="w-full text-xs text-muted-foreground" aria-live="polite">
            {pinAmount.trim() === "" ? (
              <>Pin one ingredient to what you have and rescale the whole recipe.</>
            ) : pinFactor != null && pinServings != null ? (
              <>
                ≈ {formatQuantity(pinFactor, undefined, locale)}× the recipe
                {servingsNoun ? (
                  <>
                    {" "}— {formatQuantity(pinServings, undefined, locale)}{" "}
                    {servingsNoun}
                  </>
                ) : null}
              </>
            ) : (
              <>That amount can’t be converted to this ingredient’s unit.</>
            )}
          </p>
        </form>
      )}

      {((bakersView && !!bakersFormula) || !!batchYield) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm">
          {bakersView && bakersFormula && (
            <>
              <span className="font-medium">
                Total flour{" "}
                <span className="tabular-nums">
                  {formatGrams(bakersFormula.totalFlour, locale)}
                </span>
              </span>
              {bakersFormula.hydration != null && (
                <span className="text-muted-foreground">
                  Hydration{" "}
                  <span className="tabular-nums text-foreground">
                    {Math.round(bakersFormula.hydration)}%
                  </span>
                </span>
              )}
            </>
          )}
          {batchYield && (
            <>
              <span className="text-muted-foreground">
                Batch weight{" "}
                <span className="tabular-nums text-foreground">
                  {formatGrams(batchYield.totalWeight, locale)}
                </span>
              </span>
              <label className="flex items-center gap-1.5 text-muted-foreground">
                Divide into
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step="1"
                  value={pieceCount}
                  onChange={(e) => setPieceCount(e.target.value)}
                  placeholder={
                    countableYield != null ? String(countableYield) : "N"
                  }
                  aria-label="Number of pieces"
                  className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm font-medium text-foreground"
                />
                {batchYield.perUnit != null && (
                  <span className="tabular-nums text-foreground">
                    = {formatGrams(batchYield.perUnit, locale)} each
                  </span>
                )}
              </label>
            </>
          )}
        </div>
      )}

      {scaledToHousehold && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5 text-primary" aria-hidden="true" />
          Scaled to your family of {householdSize}.
        </p>
      )}

      {memberList.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-surface/50 px-3 py-2">
          <label
            htmlFor={cookingForId}
            className="text-xs font-medium text-muted-foreground"
          >
            Cooking for
          </label>
          <select
            id={cookingForId}
            value={activeMember?.id ?? ""}
            onChange={(e) => setActiveMemberId(e.target.value || null)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <option value="">Everyone</option>
            {memberList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {activeMember &&
            (memberNeeds ? (
              <span className="text-xs text-muted-foreground">
                Flagging ingredients {activeMember.name} should avoid.
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                No restrictions saved for {activeMember.name}.
              </span>
            ))}
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {sections.map(([section, items]) => (
          <li key={section || "default"}>
            {section && (
              <h3 className="mb-1 mt-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section}
              </h3>
            )}
            <ul className="flex flex-col">
              {items.map((ing) => {
                const { number, unit } = amounts.get(ing.id) ?? {
                  number: "",
                  unit: "",
                };
                const amountChanged = changedAmountIds.has(ing.id);
                const isChecked = checked.has(ing.id);
                const justChecked = justCheckedIds.has(ing.id);
                const nudge =
                  ing.quantityMax == null
                    ? scalingNudge(
                        scaleQuantity(ing.quantity, factor),
                        ing.unit,
                        ing.item,
                      )
                    : null;
                // Practical decomposition of a messy US-volume amount (#391),
                // e.g. "≈ 1 tbsp + 1 tsp". Uses the displayed (scaled + system-
                // converted) measure, so metric/grams amounts never decompose.
                const displayed =
                  ing.quantityMax == null
                    ? measure(
                        scaleQuantity(ing.quantity, factor),
                        ing.unit,
                        system,
                        ing.item,
                      )
                    : null;
                const breakdown = displayed
                  ? decomposeMeasure(displayed.q, displayed.unit, locale)
                  : null;
                const conflict = memberNeeds
                  ? detectIngredientConflict(
                      detectAllergensForSafety(ing.item),
                      memberNeeds,
                    )
                  : null;
                const flagged = conflict != null && isIngredientConflict(conflict);
                const reason = flagged
                  ? [
                      conflict.allergens.length > 0
                        ? `contains ${formatList(
                            conflict.allergens.map((a) =>
                              ALLERGEN_LABELS[a].toLowerCase(),
                            ),
                            locale,
                          )}`
                        : null,
                      conflict.diets.length > 0
                        ? `not ${formatList(
                            conflict.diets.map((d) =>
                              DIETARY_TAG_LABELS[d].toLowerCase(),
                            ),
                            locale,
                          )}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "";
                return (
                  <li key={ing.id} className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggle(ing.id)}
                        aria-pressed={isChecked}
                        className="flex flex-1 items-baseline gap-3 rounded-lg px-2 py-2 text-start transition-colors hover:bg-muted"
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 translate-y-0.5 items-center justify-center rounded-md border-2 transition-colors",
                            isChecked
                              ? "border-primary bg-primary text-primary-foreground"
                              : flagged
                                ? "border-warning"
                                : "border-border",
                            justChecked && isChecked && "motion-safe:animate-check-box-pop",
                          )}
                          aria-hidden
                        >
                          {isChecked && (
                            <Check
                              className={cn(
                                "size-3.5",
                                justChecked && "motion-safe:animate-check-pop",
                              )}
                              strokeWidth={3}
                            />
                          )}
                        </span>
                        {kidSafe && (
                          <span
                            aria-hidden
                            className="shrink-0 translate-y-0.5 text-xl leading-none"
                          >
                            {ingredientIcon(ing.item)}
                          </span>
                        )}
                        <span
                          className={cn(
                            "relative flex-1 text-[0.95rem] [overflow-wrap:anywhere]",
                            isChecked && "text-muted-foreground",
                          )}
                        >
                          {isChecked && (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-0 flex items-center"
                            >
                              <span
                                className={cn(
                                  "h-px w-full origin-left bg-current",
                                  justChecked && "motion-safe:animate-strike-in",
                                )}
                              />
                            </span>
                          )}
                          {(number || unit) && (
                            <span
                              key={amountChanged ? `amt-${servings}-${system}` : "amt"}
                              className={cn(
                                "font-semibold tabular-nums",
                                amountChanged &&
                                  "-mx-1 rounded px-1 motion-safe:animate-amount-flash",
                              )}
                            >
                              {number}
                              {unit ? ` ${unit}` : ""}{" "}
                            </span>
                          )}
                          {ing.item}
                          {ing.prep && (
                            <Badge
                              variant="secondary"
                              className="ms-2 align-middle"
                            >
                              {ing.prep}
                            </Badge>
                          )}
                          {ing.note && (
                            <span className="text-muted-foreground">
                              {" "}
                              — {ing.note}
                            </span>
                          )}
                          {ing.stepPosition != null && (
                            <Badge variant="muted" className="ms-2 align-middle">
                              Step {ing.stepPosition}
                            </Badge>
                          )}
                          {ing.optional && (
                            <Badge variant="muted" className="ms-2 align-middle">
                              optional
                            </Badge>
                          )}
                          {bakersView && bakersPercentById.has(ing.id) && (
                            <Badge
                              variant="secondary"
                              className="ms-2 align-middle tabular-nums"
                            >
                              {formatBakersPercent(
                                bakersPercentById.get(ing.id)!,
                              )}
                            </Badge>
                          )}
                        </span>
                      </button>
                      <IngredientSubstitutions
                        item={ing.item}
                        flagged={flagged}
                        presetTags={conflict?.suggestedTags}
                        avoidAllergens={memberNeeds?.allergens}
                      />
                    </div>
                    {flagged && (
                      <p className="ms-9 mb-1 flex items-start gap-1.5 text-xs text-warning">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        <span>
                          <span className="sr-only">Dietary warning — </span>
                          {activeMember?.name}: {reason}.
                        </span>
                      </p>
                    )}
                    {nudge && (
                      <p className="ms-9 mb-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Info className="mt-0.5 size-3 shrink-0 text-primary" />
                        {nudge}
                      </p>
                    )}
                    {breakdown && (
                      <p className="ms-9 mb-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Info className="mt-0.5 size-3 shrink-0 text-primary" />
                        <span>
                          <span className="sr-only">Measure as </span>≈{" "}
                          {breakdown}
                        </span>
                      </p>
                    )}
                    {renderSuggestions && (
                      <div className="ms-9">
                        {renderSuggestions(ing.id, ing.item)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      {nutrition && (
        <NutritionPanel
          nutrition={nutrition}
          servings={servings}
          servingsNoun={servingsNoun}
          members={memberList}
        />
      )}
    </div>
  );
}
