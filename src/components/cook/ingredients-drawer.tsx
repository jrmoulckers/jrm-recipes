"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ListChecks, Utensils } from "lucide-react";

import { IngredientsPanel } from "~/components/recipe/ingredients-panel";
import type { IngredientsPanelControls } from "~/components/recipe/ingredients-panel";
import { useThemeBehavior } from "~/components/theme/theme-provider";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";

import type { CookRecipe } from "./types";

type IngredientsDrawerProps = {
  recipe: Pick<
    CookRecipe,
    "ingredients" | "servings" | "servingsNoun" | "nutrition"
  >;
  className?: string;
  label?: string;
  /**
   * Short label shown on phone-width triggers where horizontal space is tight
   * (defaults to "List"). Callers with room in the thumb zone can pass the
   * full label instead (issue #297).
   */
  compactLabel?: string;
  /**
   * Renders the trigger at the larger footer "primary action" baseline (taller
   * than the header chip). The exact height still flexes with Kids mode's
   * large-target flag, so all sizing lives in one place.
   */
  prominent?: boolean;
  /** When provided, ingredient scaling/units/checklist are lifted and shared. */
  controls?: IngredientsPanelControls;
};

export function IngredientsDrawer({
  recipe,
  className,
  label = "Ingredients",
  compactLabel = "List",
  prominent = false,
  controls,
}: IngredientsDrawerProps) {
  const t = useTranslations("ingredientsDrawer");
  // Kids mode promises "big buttons" — honor behavior.largeTargets so the
  // Ingredients trigger grows with the rest of Cook Mode's primary controls
  // (#439). Sizing is centralized here so callers only pass layout/visibility.
  const { largeTargets } = useThemeBehavior();
  const sizeClasses = prominent
    ? largeTargets
      ? "h-[4.5rem] px-8 text-xl sm:h-20"
      : "h-16 px-6 text-lg"
    : largeTargets
      ? "h-16 px-5 text-lg sm:h-[4.25rem]"
      : "h-12 px-4 sm:h-14 sm:px-5";
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          aria-label={t("region", { label })}
          className={cn(sizeClasses, className)}
        >
          <ListChecks aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{compactLabel}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        variant="sheet"
        className="start-auto end-0 top-0 grid h-dvh max-h-dvh w-full max-w-xl translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none border-y-0 border-e-0 bg-popover p-0 sm:rounded-s-2xl"
      >
        <DialogHeader className="border-b border-border p-5 pe-14 pt-[max(1.25rem,env(safe-area-inset-top))] text-start">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Utensils className="size-5 text-primary" />
            Ingredients
          </DialogTitle>
          <DialogDescription>
            Scale the recipe, switch units, and tap ingredients as you use them.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pr-[max(1.25rem,env(safe-area-inset-right))]">
          {recipe.ingredients.length > 0 ? (
            <IngredientsPanel
              ingredients={recipe.ingredients}
              baseServings={recipe.servings}
              servingsNoun={recipe.servingsNoun}
              controls={controls}
              nutrition={recipe.nutrition}
            />
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground">
              <p className="font-display text-xl font-semibold">
                No ingredients listed yet
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The recipe owner has not added an ingredient list, but you can still
                follow the cooking steps.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
