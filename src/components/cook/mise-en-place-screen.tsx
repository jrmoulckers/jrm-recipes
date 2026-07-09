"use client";

import * as React from "react";
import Link from "next/link";
import { ChefHat, ListChecks, Check, UtensilsCrossed, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { IngredientsPanel } from "~/components/recipe/ingredients-panel";
import type { IngredientsPanelControls } from "~/components/recipe/ingredients-panel";
import { cn } from "~/lib/utils";
import { derivePrepTasks } from "~/lib/mise-en-place";

import type { CookRecipe } from "./types";

/**
 * Mise en place pre-cook screen (#402): "gather & prep everything before step
 * one". Shown before step 1 when the recipe has ingredients. Reuses the shared
 * IngredientsPanel (scaling, units, and the same checklist state Cook Mode uses)
 * for the gather list, and derives a read-only "prep ahead" list from the
 * recipe's structured ingredient prep notes. Purely additive — nothing here
 * writes to the recipe or the database.
 */
export function MiseEnPlaceScreen({
  recipe,
  controls,
  largeTargets,
  onStart,
}: {
  recipe: CookRecipe;
  controls: IngredientsPanelControls;
  largeTargets: boolean;
  onStart: () => void;
}) {
  const prepTasks = React.useMemo(
    () => derivePrepTasks(recipe.ingredients),
    [recipe.ingredients],
  );
  const [prepDone, setPrepDone] = React.useState<Set<string>>(new Set());

  const ingredientCount = recipe.ingredients.length;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground">
              Mise en place
            </p>
            <h1 className="truncate font-display text-lg font-semibold tracking-tight sm:text-2xl">
              {recipe.title}
            </h1>
          </div>
          <Button asChild variant="ghost" size="icon" aria-label="Exit cook mode">
            <Link href={`/recipes/${recipe.slug}`}>
              <X />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span aria-hidden="true" className="text-4xl">
            🧺
          </span>
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Gather &amp; prep everything first
          </h2>
          <p className="max-w-prose text-muted-foreground">
            Lay out all {ingredientCount}{" "}
            {ingredientCount === 1 ? "ingredient" : "ingredients"} and finish any
            prep so you can cook without pausing. Tap items as you set them out.
          </p>
        </div>

        {prepTasks.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-token">
            <h3 className="flex items-center gap-2 font-display text-xl font-semibold">
              <UtensilsCrossed className="size-5 text-primary" />
              Prep ahead
            </h3>
            <ul className="mt-4 flex flex-col gap-1.5">
              {prepTasks.map((task) => {
                const isDone = prepDone.has(task.id);
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      aria-pressed={isDone}
                      onClick={() =>
                        setPrepDone((prev) => {
                          const next = new Set(prev);
                          if (next.has(task.id)) next.delete(task.id);
                          else next.add(task.id);
                          return next;
                        })
                      }
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-1 py-2 text-start text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        largeTargets && "py-3 text-lg",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md border border-input",
                          isDone &&
                            "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {isDone && <Check className="size-4" />}
                      </span>
                      <span
                        className={cn(
                          "min-w-0",
                          isDone && "text-muted-foreground line-through",
                        )}
                      >
                        <span className="font-medium text-foreground">
                          {task.prep}
                        </span>{" "}
                        {task.item}
                        {task.optional && (
                          <span className="ms-1 text-sm text-muted-foreground">
                            (optional)
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-token">
          <h3 className="flex items-center gap-2 font-display text-xl font-semibold">
            <ListChecks className="size-5 text-primary" />
            Gather your ingredients
          </h3>
          <div className="mt-4">
            {ingredientCount > 0 ? (
              <IngredientsPanel
                ingredients={recipe.ingredients}
                baseServings={recipe.servings}
                servingsNoun={recipe.servingsNoun}
                controls={controls}
                nutrition={recipe.nutrition}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No ingredients listed for this recipe.
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="sticky bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-2">
          <Button
            type="button"
            onClick={onStart}
            size="xl"
            className={cn(
              "w-full gap-2 rounded-2xl font-bold",
              largeTargets ? "h-[4.5rem] text-xl sm:h-20" : "h-16 text-lg",
            )}
          >
            <ChefHat aria-hidden="true" />
            Start cooking
          </Button>
        </div>
      </footer>
    </div>
  );
}
