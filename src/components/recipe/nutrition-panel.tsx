"use client";

import * as React from "react";

import { cn } from "~/lib/utils";
import { formatQuantity } from "~/lib/units";
import { Badge } from "~/components/ui/badge";
import { useActiveMemberStore } from "~/lib/active-member-store";
import {
  caloriePercentOfGoal,
  formatNutrient,
  hasNutrition,
  nutritionFlags,
  nutritionRows,
  scaleNutrition,
  type Nutrition,
  type NutrientLevel,
} from "~/lib/nutrition";

type Basis = "serving" | "whole";

/** A family member whose daily calorie goal a serving can be framed against. */
export type CalorieMember = {
  id: string;
  name: string;
  calorieGoal: number | null;
};

/** Badge variant + prose for each dietary band (issue #416). */
const LEVEL_STYLE: Record<
  NutrientLevel,
  { variant: "success" | "secondary" | "warning"; word: string }
> = {
  low: { variant: "success", word: "Low" },
  moderate: { variant: "secondary", word: "Moderate" },
  high: { variant: "warning", word: "High" },
};

/**
 * A compact Nutrition Facts panel driven by a recipe's stored *per-serving*
 * numbers (issue #414/#415). Per-serving values are invariant as the cook
 * scales the recipe — that's the whole point, since a calorie goal is
 * per-serving — while the "Whole recipe" toggle multiplies them by the current
 * serving count. Because it reads the same `servings` the ingredients panel
 * scales with, the two never disagree and nothing is double-counted.
 *
 * Renders nothing when the recipe has no nutrition data, so callers can drop it
 * in unconditionally.
 */
export function NutritionPanel({
  nutrition,
  servings,
  servingsNoun,
  className,
  members,
}: {
  /** Per-serving nutrition as stored on the recipe. */
  nutrition: Nutrition;
  /** The current (possibly scaled) serving count driving whole-recipe totals. */
  servings: number;
  servingsNoun?: string | null;
  className?: string;
  /**
   * Optional family members (issue #430). When any carry a calorie goal, the
   * panel frames the shown calories against the active member's goal.
   */
  members?: CalorieMember[];
}) {
  const [basis, setBasis] = React.useState<Basis>("serving");
  const activeMemberId = useActiveMemberStore((s) => s.activeMemberId);
  const setActiveMemberId = useActiveMemberStore((s) => s.setActiveMemberId);

  if (!hasNutrition(nutrition)) return null;

  const wholeServings =
    Number.isFinite(servings) && servings > 0 ? servings : 1;
  const scaled =
    basis === "whole" ? scaleNutrition(nutrition, wholeServings) : nutrition;
  const rows = nutritionRows(scaled);

  const noun = servingsNoun ?? "servings";
  const flags = nutritionFlags(nutrition);

  // Only members with a usable goal can produce a percentage; the active
  // selection falls back to the first such member so an indicator shows without
  // the cook having to pick one.
  const calorieCandidates = (members ?? []).filter(
    (m): m is CalorieMember & { calorieGoal: number } =>
      typeof m.calorieGoal === "number" && m.calorieGoal > 0,
  );
  const activeMember =
    calorieCandidates.find((m) => m.id === activeMemberId) ??
    calorieCandidates[0] ??
    null;
  const caloriePercent = activeMember
    ? caloriePercentOfGoal(scaled.calories, activeMember.calorieGoal)
    : null;

  return (
    <section
      aria-label="Nutrition facts"
      className={cn(
        "rounded-xl border border-border bg-surface/50 p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide">
          Nutrition
        </h3>
        <div
          role="group"
          aria-label="Nutrition basis"
          className="inline-flex rounded-lg border border-border p-0.5 text-xs"
        >
          {(["serving", "whole"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBasis(b)}
              aria-pressed={basis === b}
              className={cn(
                "rounded-md px-2 py-1 font-medium transition-colors",
                basis === b
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {b === "serving" ? "Per serving" : "Whole recipe"}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {basis === "whole"
          ? `Whole recipe · ${formatQuantity(wholeServings)} ${noun}`
          : "Amounts are per serving"}
      </p>

      {caloriePercent != null && activeMember && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <span>
            ≈{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {caloriePercent}%
            </span>{" "}
            of
          </span>
          {calorieCandidates.length > 1 ? (
            <select
              aria-label="Family member for calorie goal"
              value={activeMember.id}
              onChange={(e) => setActiveMemberId(e.target.value)}
              className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-medium text-foreground"
            >
              {calorieCandidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-medium text-foreground">
              {activeMember.name}
            </span>
          )}
          <span>
            {"'s "}daily calories
            {basis === "whole" ? " (whole recipe)" : ""}
          </span>
        </p>
      )}

      {flags.length > 0 && (
        <ul
          aria-label="Dietary flags per serving"
          className="mt-3 flex flex-wrap gap-1.5"
        >
          {flags.map((flag) => {
            const style = LEVEL_STYLE[flag.level];
            return (
              <li key={flag.key}>
                <Badge variant={style.variant}>
                  {style.word} {flag.label.toLowerCase()} · {flag.percentDV}% DV
                </Badge>
              </li>
            );
          })}
        </ul>
      )}

      <dl className="mt-3 flex flex-col">
        {rows.map((row, i) => (
          <div
            key={row.key}
            className={cn(
              "flex items-baseline justify-between gap-3 py-1.5",
              i > 0 && "border-t border-border/60",
              row.key === "calories" && "font-semibold",
            )}
          >
            <dt
              className={cn(
                "text-sm",
                row.key === "calories" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {row.label}
            </dt>
            <dd className="text-sm tabular-nums">
              {formatNutrient(row.value, row.decimals)}
              <span className="ms-1 text-muted-foreground">{row.unit}</span>
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        Estimated values as entered by the cook.
      </p>
    </section>
  );
}
