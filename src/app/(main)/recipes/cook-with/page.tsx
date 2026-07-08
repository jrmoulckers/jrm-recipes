import { type Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, SearchX, UtensilsCrossed } from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  searchByIngredients,
  type CookWithResult,
} from "~/server/recipes/queries";
import { parseHaveParam, type RawSearchParams } from "~/server/recipes/search";
import { getFavoriteRecipeIds } from "~/server/collections/queries";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { RecipeCard } from "~/components/recipe/recipe-card";
import { CookWithInput } from "~/components/recipe/cook-with-input";

export const metadata: Metadata = {
  title: "Cook with what you have",
  description: "Enter your pantry and see what you can make right now.",
};

export default async function CookWithPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getCurrentUser();
  const have = parseHaveParam((await searchParams).have);

  const [results, favoriteIds] = await Promise.all([
    isDbConfigured() && have.length > 0
      ? searchByIngredients(user, have)
      : Promise.resolve<CookWithResult[]>([]),
    getFavoriteRecipeIds(user?.id),
  ]);
  const canFavorite = Boolean(user);

  return (
    <div className="container flex flex-col gap-8 py-10">
      <div className="flex flex-col gap-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit text-muted-foreground"
        >
          <Link href="/recipes">
            <ArrowLeft /> Back to recipes
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <UtensilsCrossed className="size-7 text-primary" />
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Cook with what you have
          </h1>
        </div>
        <CookWithInput initial={have} />
      </div>

      {have.length === 0 ? (
        <Prompt />
      ) : results.length === 0 ? (
        <NoMatches />
      ) : (
        <section className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((recipe) => (
            <div key={recipe.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={recipe.coverage.missing === 0 ? "default" : "muted"}>
                  You have {recipe.coverage.matched} of {recipe.coverage.total}
                </Badge>
                {recipe.coverage.missing === 0 && (
                  <span className="text-xs font-medium text-primary">
                    Ready to cook
                  </span>
                )}
              </div>
              <RecipeCard
                recipe={recipe}
                canFavorite={canFavorite}
                favorited={favoriteIds.has(recipe.id)}
              />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Prompt() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
      <UtensilsCrossed className="size-10 text-muted-foreground" />
      <p className="max-w-md text-muted-foreground">
        Add a few ingredients above — like{" "}
        <span className="font-medium text-foreground">chicken, rice, spinach</span>{" "}
        — and we&apos;ll rank recipes by how much of each you already have.
      </p>
    </div>
  );
}

function NoMatches() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
      <SearchX className="size-10 text-muted-foreground" />
      <p className="text-muted-foreground">
        No recipes use those ingredients yet. Try fewer or more common items.
      </p>
    </div>
  );
}
