"use client";

import * as React from "react";
import { Info, Minus, Plus } from "lucide-react";

import { cn } from "~/lib/utils";
import {
  displayUnit,
  formatQuantity,
  scaleQuantity,
  toSystem,
} from "~/lib/units";
import { type UnitSystem } from "~/lib/cook-state";
import { scalingNudge } from "~/lib/substitutions";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { IngredientSubstitutions } from "~/components/recipe/ingredient-substitutions";
import { NutritionPanel } from "~/components/recipe/nutrition-panel";
import { type Nutrition } from "~/lib/nutrition";

type PanelIngredient = {
  id: string;
  section: string | null;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  item: string;
  note: string | null;
  optional: boolean;
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
};

function measure(q: number | null, unit: string | null, system: System) {
  if (q == null) return { q: null as number | null, unit: unit ?? "" };
  if (system === "original" || !unit) return { q, unit: unit ?? "" };
  const converted = toSystem(q, unit, system);
  return converted ? { q: converted.quantity, unit: converted.unit } : { q, unit };
}

function amountLabel(ing: PanelIngredient, factor: number, system: System) {
  const q = scaleQuantity(ing.quantity, factor);
  const qMax = scaleQuantity(ing.quantityMax, factor);
  const m = measure(q, ing.unit, system);
  const mMax = qMax != null ? measure(qMax, ing.unit, system) : null;
  if (m.q == null) return { number: "", unit: displayUnit(ing.unit, null) };
  const number =
    mMax?.q != null
      ? `${formatQuantity(m.q)}–${formatQuantity(mMax.q)}`
      : formatQuantity(m.q);
  return { number, unit: displayUnit(m.unit, m.q) };
}

export function IngredientsPanel({
  ingredients,
  baseServings,
  servingsNoun,
  controls,
  nutrition,
}: {
  ingredients: PanelIngredient[];
  baseServings: number | null;
  servingsNoun: string | null;
  controls?: IngredientsPanelControls;
  /** Optional per-serving nutrition; renders a facts panel that scales with servings. */
  nutrition?: Nutrition;
}) {
  const canScale = baseServings != null && baseServings > 0;
  const [servingsInternal, setServingsInternal] = React.useState(
    baseServings ?? 1,
  );
  const [systemInternal, setSystemInternal] = React.useState<System>("original");
  const [checkedInternal, setCheckedInternal] = React.useState<Set<string>>(
    new Set(),
  );

  const servings = controls ? controls.servings : servingsInternal;
  const system = controls ? controls.system : systemInternal;
  const checked = controls ? controls.checked : checkedInternal;

  const factor = canScale ? servings / baseServings : 1;

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

  function updateServings(next: number) {
    if (controls) controls.onServingsChange(next);
    else setServingsInternal(next);
  }

  function updateSystem(next: System) {
    if (controls) controls.onSystemChange(next);
    else setSystemInternal(next);
  }

  function toggle(id: string) {
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
              <div className="font-display text-xl font-semibold tabular-nums">
                {formatQuantity(servings)}
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
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Ingredients</span>
        )}

        <div
          role="group"
          aria-label="Measurement system"
          className="inline-flex rounded-lg border border-border p-0.5 text-sm"
        >
          {(["original", "us", "metric"] as const).map((s) => (
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
                const { number, unit } = amountLabel(ing, factor, system);
                const isChecked = checked.has(ing.id);
                const nudge =
                  ing.quantityMax == null
                    ? scalingNudge(
                        scaleQuantity(ing.quantity, factor),
                        ing.unit,
                        ing.item,
                      )
                    : null;
                return (
                  <li key={ing.id} className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggle(ing.id)}
                        aria-pressed={isChecked}
                        className="flex flex-1 items-baseline gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 translate-y-0.5 items-center justify-center rounded-md border-2 text-[10px] transition-colors",
                            isChecked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border",
                          )}
                          aria-hidden
                        >
                          {isChecked ? "✓" : ""}
                        </span>
                        <span
                          className={cn(
                            "flex-1 text-[0.95rem]",
                            isChecked && "text-muted-foreground line-through",
                          )}
                        >
                          {(number || unit) && (
                            <span className="font-semibold tabular-nums">
                              {number}
                              {unit ? ` ${unit}` : ""}{" "}
                            </span>
                          )}
                          {ing.item}
                          {ing.note && (
                            <span className="text-muted-foreground">
                              {" "}
                              — {ing.note}
                            </span>
                          )}
                          {ing.optional && (
                            <Badge variant="muted" className="ml-2 align-middle">
                              optional
                            </Badge>
                          )}
                        </span>
                      </button>
                      <IngredientSubstitutions item={ing.item} />
                    </div>
                    {nudge && (
                      <p className="ml-9 mb-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Info className="mt-0.5 size-3 shrink-0 text-primary" />
                        {nudge}
                      </p>
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
        />
      )}
    </div>
  );
}
