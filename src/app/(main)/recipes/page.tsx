import { type Metadata } from "next";
import Link from "next/link";
import { ChefHat, Clock3, Compass, SearchX, Tags as TagIcon, UtensilsCrossed } from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { type User } from "~/server/db/schema";
import {
  attachCardAllergens,
  listLibrary,
  listPublicRecipes,
  listRecentlyViewed,
  listRecipeFacets,
  listTagsWithCounts,
  searchRecipes,
  suggestSearchTerm,
  type RecipeSearchResult,
} from "~/server/recipes/queries";
import { listMemberProfiles } from "~/server/dietary/queries";
import { isAllergen } from "~/lib/allergens";
import {
  isDefaultRecipeView,
  parseRecipeSearch,
  type RecipeSearch,
} from "~/server/recipes/search";
import { getFavoriteRecipeIds } from "~/server/collections/queries";
import { listMySavedSearches } from "~/server/searches/queries";
import { Button } from "~/components/ui/button";
import { RecipeCard } from "~/components/recipe/recipe-card";
import { type CardDietaryMember } from "~/components/recipe/card-dietary-badge";
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

/** How many popular tags to show in the browse-view "Browse by tag" strip. */
const POPULAR_BROWSE_TAG_COUNT = 10;

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const search = parseRecipeSearch(await searchParams);
  const browsing = isDefaultRecipeView(search);
  const dbReady = isDbConfigured();
  const [facets, savedSearches] = await Promise.all([
    dbReady
      ? listRecipeFacets(user, search)
      : Promise.resolve({ cuisines: [], tags: [] }),
    listMySavedSearches(user?.id),
  ]);
  const members: CardDietaryMember[] =
    dbReady && user
      ? (await listMemberProfiles(user.id)).map((m) => ({
          id: m.id,
          name: m.name,
          allergens: (m.allergens ?? []).filter(isAllergen),
        }))
      : [];

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
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="lg" variant="outline">
            <Link href="/recipes/cook-with">
              <UtensilsCrossed /> Cook with what you have
            </Link>
          </Button>
          <Button asChild size="lg">
            <Link href="/recipes/new">
              <ChefHat /> New recipe
            </Link>
          </Button>
        </div>
      </div>

      {!dbReady ? (
        <ConnectDbNotice />
      ) : (
        <>
          <RecipeSearchControls
            search={search}
            facets={facets}
            savedSearches={savedSearches}
            members={members}
          />
          {browsing ? (
            <BrowseSections user={user} members={members} />
          ) : (
            <SearchResults user={user} search={search} members={members} />
          )}
        </>
      )}
    </div>
  );
}

/** Default browse view: the viewer's own cookbook plus a paginated discover feed. */
async function BrowseSections({
  user,
  members,
}: {
  user: User | null;
  members: CardDietaryMember[];
}) {
  const [mine, discover, favoriteIds, tags, recentlyViewed] = await Promise.all([
    listLibrary(user),
    listPublicRecipes(),
    getFavoriteRecipeIds(user?.id),
    listTagsWithCounts(user),
    listRecentlyViewed(user),
  ]);
  const mineIds = new Set(mine.map((r) => r.id));
  const discoverOnly = discover.items.filter((r) => !mineIds.has(r.id));
  const canFavorite = Boolean(user);
  const popularTags = [...tags]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, POPULAR_BROWSE_TAG_COUNT);
  // Only pay for allergen roll-up when a family member with allergies is active.
  const showBadges = members.some((m) => m.allergens.length > 0);
  const mineCards = showBadges ? await attachCardAllergens(mine) : mine;

  return (
    <>
      {recentlyViewed.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Clock3 className="size-5 text-primary" />
            <h2 className="font-display text-xl font-bold tracking-tight">
              Recently viewed
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recentlyViewed.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                canFavorite={canFavorite}
                favorited={favoriteIds.has(recipe.id)}
              />
            ))}
          </div>
        </section>
      )}

      {popularTags.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TagIcon className="size-5 text-primary" />
              <h2 className="font-display text-lg font-bold tracking-tight">
                Browse by tag
              </h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/recipes/tags">All tags</Link>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {popularTags.map((tag) => (
              <Link
                key={tag.slug}
                href={`/recipes?tag=${encodeURIComponent(tag.slug)}`}
                className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <span className="text-foreground group-hover:text-primary">
                  #{tag.name}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {tag.count}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {mine.length > 0 ? (
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {mineCards.map((recipe, i) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              canFavorite={canFavorite}
              favorited={favoriteIds.has(recipe.id)}
              priority={i < LCP_PRIORITY_COUNT}
              members={members}
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
  members,
}: {
  user: User | null;
  search: RecipeSearch;
  members: CardDietaryMember[];
}) {
  const [results, favoriteIds] = await Promise.all([
    searchRecipes(user, search),
    getFavoriteRecipeIds(user?.id),
  ]);
  const canFavorite = Boolean(user);

  if (results.length === 0) {
    // Typo-tolerant fallback: only for text queries, and only when a close
    // trigram match exists *and* actually yields results.
    const suggestion = search.q ? await suggestSearchTerm(user, search.q) : null;
    if (suggestion) {
      const corrected = await searchRecipes(user, { ...search, q: suggestion });
      if (corrected.length > 0) {
        return (
          <ResultsGrid
            results={corrected}
            favoriteIds={favoriteIds}
            canFavorite={canFavorite}
            members={members}
            correction={{ from: search.q!, to: suggestion }}
          />
        );
      }
    }
    return <NoResults />;
  }

  return (
    <ResultsGrid
      results={results}
      favoriteIds={favoriteIds}
      canFavorite={canFavorite}
      members={members}
    />
  );
}

/** Results header + card grid, with an optional "did you mean" correction note. */
async function ResultsGrid({
  results,
  favoriteIds,
  canFavorite,
  members,
  correction,
}: {
  results: RecipeSearchResult[];
  favoriteIds: Set<string>;
  canFavorite: boolean;
  members: CardDietaryMember[];
  correction?: { from: string; to: string };
}) {
  // Only pay for allergen roll-up when a family member with allergies is active.
  const showBadges = members.some((m) => m.allergens.length > 0);
  const cards = showBadges ? await attachCardAllergens(results) : results;
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Results
          </h2>
          {correction && (
            <p className="text-sm text-muted-foreground">
              No exact matches for{" "}
              <span className="font-medium text-foreground">
                &ldquo;{correction.from}&rdquo;
              </span>
              . Showing results for{" "}
              <span className="font-medium text-foreground">
                &ldquo;{correction.to}&rdquo;
              </span>
              .
            </p>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {results.length} recipe{results.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((recipe, i) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            canFavorite={canFavorite}
            favorited={favoriteIds.has(recipe.id)}
            priority={i < LCP_PRIORITY_COUNT}
            matchReason={recipe.matchReason}
            members={members}
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
