"use client";

import * as React from "react";
import { ListChecks, Utensils } from "lucide-react";

import { IngredientsPanel } from "~/components/recipe/ingredients-panel";
import type { IngredientsPanelControls } from "~/components/recipe/ingredients-panel";
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
  /** When provided, ingredient scaling/units/checklist are lifted and shared. */
  controls?: IngredientsPanelControls;
};

export function IngredientsDrawer({
  recipe,
  className,
  label = "Ingredients",
  controls,
}: IngredientsDrawerProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          aria-label={`${label} list and recipe scaling`}
          className={cn("h-12 px-4 sm:h-14 sm:px-5", className)}
        >
          <ListChecks aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">List</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="left-auto right-0 top-0 grid h-dvh max-h-dvh w-full max-w-xl translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none border-y-0 border-r-0 bg-popover p-0 sm:rounded-l-2xl">
        <DialogHeader className="border-b border-border p-5 pr-14 text-left">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Utensils className="size-5 text-primary" />
            Ingredients
          </DialogTitle>
          <DialogDescription>
            Scale the recipe, switch units, and tap ingredients as you use them.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto p-5">
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
