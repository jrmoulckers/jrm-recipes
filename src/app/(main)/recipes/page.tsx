import { type Metadata } from "next";
import Link from "next/link";
import { ChefHat, Compass, UtensilsCrossed } from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listLibrary, listPublicRecipes } from "~/server/recipes/queries";
import {
  parseRatingSort,
  RATING_SORT_LABELS,
  RATING_SORTS,
  type RatingSort,
} from "~/lib/ratings";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { RecipeCard } from "~/components/recipe/recipe-card";
import { DiscoverFeed } from "~/components/recipe/discover-feed";

export const metadata: Metadata = { title: "Recipes" };

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const { sort: sortParam } = await searchParams;
  const sort = parseRatingSort(sortParam);
  const user = await getCurrentUser();
  const [mine, discover] = await Promise.all([
    listLibrary(user, sort),
    listPublicRecipes({ sort }),
  ]);
  const mineIds = new Set(mine.map((r) => r.id));
  const discoverOnly = discover.items.filter((r) => !mineIds.has(r.id));

  return (
    <div className="container flex flex-col gap-10 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Your cookbook
          </h1>
          <p className="mt-1 text-muted-foreground">
            Everything you and your family have saved.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isDbConfigured() && <SortControl current={sort} />}
          <Button asChild size="lg">
            <Link href="/recipes/new">
              <ChefHat /> New recipe
            </Link>
          </Button>
        </div>
      </div>

      {!isDbConfigured() ? (
        <ConnectDbNotice />
      ) : mine.length > 0 ? (
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </section>
      ) : (
        <EmptyLibrary />
      )}

      {discoverOnly.length > 0 && (
        <section className="flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <Compass className="size-5 text-primary" />
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Discover
            </h2>
          </div>
          <DiscoverFeed
            key={sort}
            initialItems={discoverOnly}
            initialNextOffset={discover.nextOffset}
            sort={sort}
          />
        </section>
      )}
    </div>
  );
}

function SortControl({ current }: { current: RatingSort }) {
  return (
    <div
      className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm shadow-token"
      role="group"
      aria-label="Sort recipes"
    >
      {RATING_SORTS.map((option) => {
        const active = option === current;
        return (
          <Link
            key={option}
            href={option === "recent" ? "/recipes" : `/recipes?sort=${option}`}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {RATING_SORT_LABELS[option]}
          </Link>
        );
      })}
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center">
      <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <UtensilsCrossed className="size-7" />
      </span>
      <div>
        <h2 className="font-display text-xl font-semibold">No recipes yet</h2>
        <p className="mt-1 max-w-sm text-muted-foreground">
          Add the dish everyone always asks you to make. It only takes a minute.
        </p>
      </div>
      <Button asChild size="lg">
        <Link href="/recipes/new">
          <ChefHat /> Create your first recipe
        </Link>
      </Button>
    </div>
  );
}

function ConnectDbNotice() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
      <p className="mx-auto max-w-md">
        Connect a database to start saving recipes. Set{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          DATABASE_URL
        </code>{" "}
        (see <code className="font-mono text-sm">.env.example</code>) or run{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          docker compose up -d
        </code>
        .
      </p>
    </div>
  );
}
