import { type Metadata } from "next";
import Link from "next/link";
import { ChefHat, Compass, SearchX } from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { type User } from "~/server/db/schema";
import {
  listLibrary,
  listPublicRecipes,
  listRecipeFacets,
  searchRecipes,
} from "~/server/recipes/queries";
import {
  isDefaultRecipeView,
  parseRecipeSearch,
  type RecipeSearch,
} from "~/server/recipes/search";
import { getFavoriteRecipeIds } from "~/server/collections/queries";
import { Button } from "~/components/ui/button";
import { RecipeCard } from "~/components/recipe/recipe-card";
import { DiscoverFeed } from "~/components/recipe/discover-feed";
import { EmptyLibraryCta } from "~/components/recipe/empty-library-cta";
import { RecipeSearchControls } from "~/components/recipe/recipe-search-controls";

export const metadata: Metadata = { title: "Recipes" };

/**
 * Number of leading cards treated as above-the-fold for LCP: the first row of
 * the widest grid layout (`lg:grid-cols-3`). These render their cover image
 * with `priority` so the LCP image is preloaded instead of lazy-loaded; every
 * card after the first row stays lazy.
 */
const LCP_PRIORITY_COUNT = 3;

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const search = parseRecipeSearch(await searchParams);
  const browsing = isDefaultRecipeView(search);
  const facets = isDbConfigured()
    ? await listRecipeFacets(user)
    : { cuisines: [], tags: [] };

  return (
    <div className="container flex flex-col gap-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Your cookbook
          </h1>
          <p className="mt-1 text-muted-foreground">
            Everything you and your family have saved.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/recipes/new">
            <ChefHat /> New recipe
          </Link>
        </Button>
      </div>

      {!isDbConfigured() ? (
        <ConnectDbNotice />
      ) : (
        <>
          <RecipeSearchControls search={search} facets={facets} />
          {browsing ? (
            <BrowseSections user={user} />
          ) : (
            <SearchResults user={user} search={search} />
          )}
        </>
      )}
    </div>
  );
}

/** Default browse view: the viewer's own cookbook plus a paginated discover feed. */
async function BrowseSections({ user }: { user: User | null }) {
  const [mine, discover, favoriteIds] = await Promise.all([
    listLibrary(user),
    listPublicRecipes(),
    getFavoriteRecipeIds(user?.id),
  ]);
  const mineIds = new Set(mine.map((r) => r.id));
  const discoverOnly = discover.items.filter((r) => !mineIds.has(r.id));
  const canFavorite = Boolean(user);

  return (
    <>
      {mine.length > 0 ? (
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((recipe, i) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              canFavorite={canFavorite}
              favorited={favoriteIds.has(recipe.id)}
              priority={i < LCP_PRIORITY_COUNT}
            />
          ))}
        </section>
      ) : (
        <EmptyLibraryCta />
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
            initialItems={discoverOnly}
            initialNextOffset={discover.nextOffset}
            canFavorite={canFavorite}
            favoritedIds={[...favoriteIds]}
            priorityCount={mine.length === 0 ? LCP_PRIORITY_COUNT : 0}
          />
        </section>
      )}
    </>
  );
}

/** Flat, filtered + sorted results grid shown once a search or filter is set. */
async function SearchResults({
  user,
  search,
}: {
  user: User | null;
  search: RecipeSearch;
}) {
  const [results, favoriteIds] = await Promise.all([
    searchRecipes(user, search),
    getFavoriteRecipeIds(user?.id),
  ]);
  const canFavorite = Boolean(user);

  if (results.length === 0) return <NoResults />;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-bold tracking-tight">
          Results
        </h2>
        <span className="text-sm text-muted-foreground">
          {results.length} recipe{results.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((recipe, i) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            canFavorite={canFavorite}
            favorited={favoriteIds.has(recipe.id)}
            priority={i < LCP_PRIORITY_COUNT}
          />
        ))}
      </div>
    </section>
  );
}

function NoResults() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center">
      <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <SearchX className="size-7" />
      </span>
      <div>
        <h2 className="font-display text-xl font-semibold">No matches</h2>
        <p className="mt-1 max-w-sm text-muted-foreground">
          Try fewer filters or a different search — your next favorite might be
          hiding under another name.
        </p>
      </div>
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
