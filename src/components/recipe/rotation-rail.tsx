import Link from "next/link";
import { ChefHat, RotateCcw } from "lucide-react";

import {
  RecipeCard,
  type CardRecipe,
  type QuickPlanContext,
} from "~/components/recipe/recipe-card";
import { QuickPlanButton } from "~/components/recipe/quick-plan-button";
import { Button } from "~/components/ui/button";

/**
 * "Back in the rotation" rail (#426): family favorites the cook hasn't made in a
 * while, each with quick Cook and Add-to-plan actions to break the same-five-
 * dinners rut. Renders nothing when there aren't enough qualifying favorites —
 * the caller decides that threshold and passes the already-filtered list.
 */
export function RotationRail({
  recipes,
  quickPlan,
}: {
  recipes: CardRecipe[];
  quickPlan: QuickPlanContext | null;
}) {
  if (recipes.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <RotateCcw className="size-5 text-primary" />
          <h2 className="font-display text-xl font-bold tracking-tight">
            Back in the rotation
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Family favorites you haven&apos;t made in a while.
        </p>
      </div>
      <div className="flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {recipes.map((recipe) => (
          <div
            key={recipe.id}
            className="flex w-64 shrink-0 snap-start flex-col gap-2"
          >
            <RecipeCard recipe={recipe} />
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link href={`/recipes/${recipe.slug}/cook`}>
                  <ChefHat /> Cook
                </Link>
              </Button>
              {quickPlan ? (
                <QuickPlanButton
                  recipeId={recipe.id}
                  recipeTitle={recipe.title}
                  days={quickPlan.days}
                  defaultDate={quickPlan.defaultDate}
                  variant="button"
                  className="flex-1"
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
