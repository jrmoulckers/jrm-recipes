import { type Metadata } from "next";
import Link from "next/link";
import {
  ChefHat,
  Clock3,
  Compass,
  Database,
  SearchX,
  Tags as TagIcon,
  UtensilsCrossed,
} from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { type User } from "~/server/db/schema";
import {
  attachCardAllergens,
  listLibrary,
  listLibraryRecipeIds,
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
  recipeSearchToQueryString,
  type RecipeSearch,
} from "~/server/recipes/search";
import { getFavoriteRecipeIds } from "~/server/collections/queries";
import { buildQuickPlanContext } from "~/server/planner/quick-plan";
import { listMySavedSearches } from "~/server/searches/queries";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";
import {
  RecipeCard,
  type QuickPlanContext,
} from "~/components/recipe/recipe-card";
import { type CardDietaryMember } from "~/components/recipe/card-dietary-badge";
import { DiscoverFeed } from "~/components/recipe/discover-feed";
import { LibraryFeed } from "~/components/recipe/library-feed";
import { SearchResultsFeed } from "~/components/recipe/search-results-feed";
import { EmptyLibraryCta } from "~/components/recipe/empty-library-cta";
import { WelcomeChecklist } from "~/components/onboarding/welcome-checklist";
import { RecipeSearchControls } from "~/components/recipe/recipe-search-controls";
import { QuickCaptureDialog } from "~/components/recipe/quick-capture-dialog";
import { type SearchParams } from "~/lib/route-params";

export const metadata: Metadata = {
  title: "Your recipes",
  description:
    "Every recipe you've saved and created, together in one library.",
};

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
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  const search = parseRecipeSearch(await searchParams);
  const browsing = isDefaultRecipeView(search);
  const dbReady = isDbConfigured();
  const [facets, savedSearches, quickPlan] = await Promise.all([
    dbReady
      ? listRecipeFacets(user, search)
      : Promise.resolve({ cuisines: [], tags: [] }),
    listMySavedSearches(user?.id),
    dbReady && user ? buildQuickPlanContext(user.id) : Promise.resolve(null),
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
          {dbReady && user ? <QuickCaptureDialog /> : null}
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
            <BrowseSections
              user={user}
              members={members}
              quickPlan={quickPlan}
            />
          ) : (
            <SearchResults
              user={user}
              search={search}
              members={members}
              quickPlan={quickPlan}
            />
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
  quickPlan,
}: {
  user: User | null;
  members: CardDietaryMember[];
  quickPlan: QuickPlanContext | null;
}) {
  const [library, discover, favoriteIds, tags, recentlyViewed, libraryIds] =
    await Promise.all([
      listLibrary(user),
      listPublicRecipes(),
      getFavoriteRecipeIds(user?.id),
      listTagsWithCounts(user),
      listRecentlyViewed(user),
      listLibraryRecipeIds(user),
    ]);
  // Exclude the viewer's whole library from Discover (not just the first page),
  // so paging the cookbook can't leak their own recipes into the feed (#57).
  const mineIds = new Set(libraryIds);
  const discoverOnly = discover.items.filter((r) => !mineIds.has(r.id));
  const hasLibrary = library.items.length > 0;
  const canFavorite = Boolean(user);
  const popularTags = [...tags]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, POPULAR_BROWSE_TAG_COUNT);
  // Only pay for allergen roll-up when a family member with allergies is active.
  const showBadges = members.some((m) => m.allergens.length > 0);
  const libraryCards = showBadges
    ? await attachCardAllergens(library.items)
    : library.items;

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
                quickPlan={quickPlan ?? undefined}
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

      {hasLibrary ? (
        <section className="flex flex-col gap-5">
          <LibraryFeed
            initialItems={libraryCards}
            initialNextOffset={library.nextOffset}
            canFavorite={canFavorite}
            favoritedIds={[...favoriteIds]}
            priorityCount={LCP_PRIORITY_COUNT}
            members={members}
            quickPlan={quickPlan ?? undefined}
          />
        </section>
      ) : (
        <>
          {user && <WelcomeChecklist />}
          <EmptyLibraryCta />
        </>
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
            priorityCount={hasLibrary ? 0 : LCP_PRIORITY_COUNT}
          />
        </section>
      )}
    </>
  );
}

/** Flat, filtered + sorted results shown once a search or filter is set. */
async function SearchResults({
  user,
  search,
  members,
  quickPlan,
}: {
  user: User | null;
  search: RecipeSearch;
  members: CardDietaryMember[];
  quickPlan: QuickPlanContext | null;
}) {
  const [page, favoriteIds] = await Promise.all([
    searchRecipes(user, search),
    getFavoriteRecipeIds(user?.id),
  ]);
  const canFavorite = Boolean(user);

  if (page.items.length === 0) {
    // Typo-tolerant fallback: only for text queries, and only when a close
    // trigram match exists *and* actually yields results.
    const suggestion = search.q
      ? await suggestSearchTerm(user, search.q)
      : null;
    if (suggestion) {
      const correctedSearch = { ...search, q: suggestion };
      const corrected = await searchRecipes(user, correctedSearch);
      if (corrected.items.length > 0) {
        return (
          <ResultsView
            page={corrected}
            search={correctedSearch}
            favoriteIds={favoriteIds}
            canFavorite={canFavorite}
            members={members}
            quickPlan={quickPlan}
            correction={{ from: search.q!, to: suggestion }}
          />
        );
      }
    }
    return <NoResults search={search} />;
  }

  return (
    <ResultsView
      page={page}
      search={search}
      favoriteIds={favoriteIds}
      canFavorite={canFavorite}
      members={members}
      quickPlan={quickPlan}
    />
  );
}

/**
 * Attaches allergen badges to the first page and hands paging off to the client
 * {@link SearchResultsFeed}, which owns the "Load more" button and the count
 * hint. The active search is serialized to its canonical query string so the
 * load-more action re-parses (and re-validates) it server-side (#58).
 */
async function ResultsView({
  page,
  search,
  favoriteIds,
  canFavorite,
  members,
  quickPlan,
  correction,
}: {
  page: { items: RecipeSearchResult[]; nextOffset: number | null };
  search: RecipeSearch;
  favoriteIds: Set<string>;
  canFavorite: boolean;
  members: CardDietaryMember[];
  quickPlan: QuickPlanContext | null;
  correction?: { from: string; to: string };
}) {
  // Only pay for allergen roll-up when a family member with allergies is active.
  const showBadges = members.some((m) => m.allergens.length > 0);
  const cards = showBadges ? await attachCardAllergens(page.items) : page.items;
  return (
    <SearchResultsFeed
      initialItems={cards}
      initialNextOffset={page.nextOffset}
      queryString={recipeSearchToQueryString(search)}
      canFavorite={canFavorite}
      favoritedIds={[...favoriteIds]}
      priorityCount={LCP_PRIORITY_COUNT}
      members={members}
      quickPlan={quickPlan ?? undefined}
      correction={correction}
    />
  );
}

function NoResults({ search }: { search: RecipeSearch }) {
  const query = search.q?.trim();
  return (
    <EmptyState
      icon={<SearchX />}
      title={query ? `No matches for “${query}”` : "No matches"}
      description="Try fewer filters or a different search — your next favorite might be hiding under another name."
      action={
        <>
          <Button asChild>
            <Link href="/recipes">
              <Compass /> Clear all filters
            </Link>
          </Button>
          <Button asChild variant="outline">
            {/* Deep-link "create this recipe" with the searched term as a
                starting title, so a missing recipe becomes an invitation to add
                it (#103). Object href stays type-safe under typedRoutes. */}
            <Link
              href={{
                pathname: "/recipes/new",
                query: query ? { title: query } : undefined,
              }}
            >
              <ChefHat /> {query ? `Create “${query}”` : "Create a recipe"}
            </Link>
          </Button>
        </>
      }
    />
  );
}

function ConnectDbNotice() {
  return (
    <EmptyState
      icon={<Database />}
      title="Connect a database to start"
      description={
        <>
          Set{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            DATABASE_URL
          </code>{" "}
          (see <code className="font-mono text-sm">.env.example</code>) or run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            docker compose up -d
          </code>
          .
        </>
      }
    />
  );
}
