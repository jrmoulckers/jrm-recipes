"use client";

import * as React from "react";
import { AlertTriangle, Info, Minus, Plus, Users } from "lucide-react";
import { useLocale } from "next-intl";

import { cn } from "~/lib/utils";
import {
  displayUnit,
  formatQuantity,
  scaleQuantity,
  toSystem,
} from "~/lib/units";
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

function measure(q: number | null, unit: string | null, system: System) {
  if (q == null) return { q: null as number | null, unit: unit ?? "" };
  if (system === "original" || !unit) return { q, unit: unit ?? "" };
  const converted = toSystem(q, unit, system);
  return converted ? { q: converted.quantity, unit: converted.unit } : { q, unit };
}

function amountLabel(
  ing: PanelIngredient,
  factor: number,
  system: System,
  locale: string,
) {
  const q = scaleQuantity(ing.quantity, factor);
  const qMax = scaleQuantity(ing.quantityMax, factor);
  const m = measure(q, ing.unit, system);
  const mMax = qMax != null ? measure(qMax, ing.unit, system) : null;
  if (m.q == null) return { number: "", unit: displayUnit(ing.unit, null, locale) };
  const number =
    mMax?.q != null
      ? `${formatQuantity(m.q, undefined, locale)}–${formatQuantity(mMax.q, undefined, locale)}`
      : formatQuantity(m.q, undefined, locale);
  return { number, unit: displayUnit(m.unit, m.q, locale) };
}

export function IngredientsPanel({
  ingredients,
  baseServings,
  servingsNoun,
  controls,
  nutrition,
  members,
}: {
  ingredients: PanelIngredient[];
  baseServings: number | null;
  servingsNoun: string | null;
  controls?: IngredientsPanelControls;
  /** Optional per-serving nutrition; renders a facts panel that scales with servings. */
  nutrition?: Nutrition;
  /** Optional saved family members (calorie goals #430 + conflict flags #429). */
  members?: DietaryMember[];
}) {
  const canScale = baseServings != null && baseServings > 0;
  const [servingsInternal, setServingsInternal] = React.useState(
    baseServings ?? 1,
  );
  const [systemInternal, setSystemInternal] = React.useState<System>("original");
  const [checkedInternal, setCheckedInternal] = React.useState<Set<string>>(
    new Set(),
  );

  const activeMemberId = useActiveMemberStore((s) => s.activeMemberId);
  const setActiveMemberId = useActiveMemberStore((s) => s.setActiveMemberId);
  const locale = useLocale();

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
                {formatQuantity(servings, undefined, locale)}
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
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm font-medium"
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
                const { number, unit } = amountLabel(ing, factor, system, locale);
                const isChecked = checked.has(ing.id);
                const nudge =
                  ing.quantityMax == null
                    ? scalingNudge(
                        scaleQuantity(ing.quantity, factor),
                        ing.unit,
                        ing.item,
                      )
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
                        className="flex flex-1 items-baseline gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 translate-y-0.5 items-center justify-center rounded-md border-2 text-[10px] transition-colors",
                            isChecked
                              ? "border-primary bg-primary text-primary-foreground"
                              : flagged
                                ? "border-warning"
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
                      <IngredientSubstitutions
                        item={ing.item}
                        flagged={flagged}
                        presetTags={conflict?.suggestedTags}
                        avoidAllergens={memberNeeds?.allergens}
                      />
                    </div>
                    {flagged && (
                      <p className="ml-9 mb-1 flex items-start gap-1.5 text-xs text-warning">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        <span>
                          <span className="sr-only">Dietary warning — </span>
                          {activeMember?.name}: {reason}.
                        </span>
                      </p>
                    )}
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
          members={memberList}
        />
      )}
    </div>
  );
}
