import { type Metadata } from 'next';
import { type ReactNode } from 'react';
import Link from 'next/link';
import { ChefHat, Clock3, Compass, Database, SearchX, UtensilsCrossed } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { getCurrentUser } from '~/server/auth';
import { isDbConfigured } from '~/server/db';
import { type User } from '~/server/db/schema';
import {
  attachCardAllergens,
  listLibrary,
  listLibraryRecipeIds,
  listPublicRecipes,
  listRecentlyViewed,
  listRecipeFacets,
  listTagsWithCounts,
  listUserGroups,
  searchRecipes,
  suggestSearchTerm,
  type RecipeSearchResult,
} from '~/server/recipes/queries';
import { listMemberProfiles } from '~/server/dietary/queries';
import { isAllergen } from '~/lib/allergens';
import {
  isDefaultRecipeView,
  parseRecipeSearch,
  recipeSearchToQueryString,
  type RecipeSearch,
} from '~/server/recipes/search';
import { getFavoriteRecipeIds } from '~/server/collections/queries';
import { buildQuickPlanContext } from '~/server/planner/quick-plan';
import { listMySavedSearches } from '~/server/searches/queries';
import { Button } from '~/components/ui/button';
import { EmptyState } from '~/components/ui/empty-state';
import { RecipeCard, type QuickPlanContext } from '~/components/recipe/recipe-card';
import { type CardDietaryMember } from '~/components/recipe/card-dietary-badge';
import { DiscoverFeed } from '~/components/recipe/discover-feed';
import { LibraryFeed } from '~/components/recipe/library-feed';
import { SearchResultsFeed } from '~/components/recipe/search-results-feed';
import { EmptyLibraryCta } from '~/components/recipe/empty-library-cta';
import { WelcomeChecklist } from '~/components/onboarding/welcome-checklist';
import { RecipeSearchControls } from '~/components/recipe/recipe-search-controls';
import { QuickCaptureDialog } from '~/components/recipe/quick-capture-dialog';
import { type SearchParams } from '~/lib/route-params';
import { withRouteMessages } from '~/components/i18n/route-messages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: t('library.title'),
    description: t('library.description'),
  };
}

/**
 * Number of leading cards treated as above-the-fold for LCP: the first row of
 * the widest grid layout (`lg:grid-cols-3`). These render their cover image
 * with `priority` so the LCP image is preloaded instead of lazy-loaded. Every
 * card after the first row stays lazy.
 */
const LCP_PRIORITY_COUNT = 3;

async function RecipesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  const search = parseRecipeSearch(await searchParams);
  const browsing = isDefaultRecipeView(search);
  const dbReady = isDbConfigured();
  const [facets, classifications, savedSearches, quickPlan, groups] = await Promise.all([
    dbReady
      ? listRecipeFacets(user, search)
      : Promise.resolve({ cuisines: [], meals: [], tags: [] }),
    // Hoisted out of the browse-only section (#661) so the classification row
    // in the filter card survives the switch to a filtered results view.
    dbReady ? listTagsWithCounts(user) : Promise.resolve([]),
    listMySavedSearches(user?.id),
    dbReady && user ? buildQuickPlanContext(user.id) : Promise.resolve(null),
    dbReady && user ? listUserGroups(user.id) : Promise.resolve([]),
  ]);
  const members: CardDietaryMember[] =
    dbReady && user
      ? (await listMemberProfiles(user.id)).map((m) => ({
          id: m.id,
          name: m.name,
          allergens: (m.allergens ?? []).filter(isAllergen),
        }))
      : [];
  const t = await getTranslations('recipe.library');

  return (
    <div className="container flex flex-col gap-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="lg" variant="outline">
            <Link href="/recipes/cook-with">
              <UtensilsCrossed /> {t('cookWith')}
            </Link>
          </Button>
          {dbReady && user ? <QuickCaptureDialog /> : null}
          <Button asChild size="lg">
            <Link href="/recipes/new">
              <ChefHat /> {t('newRecipe')}
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
            classifications={classifications}
            savedSearches={savedSearches}
            members={members}
            groups={groups}
            signedIn={Boolean(user)}
          />
          {browsing ? (
            <BrowseSections user={user} members={members} quickPlan={quickPlan} />
          ) : (
            <SearchResults user={user} search={search} members={members} quickPlan={quickPlan} />
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
  const [library, discover, favoriteIds, recentlyViewed, libraryIds] = await Promise.all([
    listLibrary(user),
    listPublicRecipes(),
    getFavoriteRecipeIds(user?.id),
    listRecentlyViewed(user),
    listLibraryRecipeIds(user),
  ]);
  // Exclude the viewer's whole library from Discover (not just the first page),
  // so paging the cookbook can't leak their own recipes into the feed (#57).
  const mineIds = new Set(libraryIds);
  const discoverOnly = discover.items.filter((r) => !mineIds.has(r.id));
  const hasLibrary = library.items.length > 0;
  const canFavorite = Boolean(user);
  // Only pay for allergen roll-up when a family member with allergies is active.
  const showBadges = members.some((m) => m.allergens.length > 0);
  const libraryCards = showBadges ? await attachCardAllergens(library.items) : library.items;
  const t = await getTranslations('recipe.library');

  return (
    <>
      {recentlyViewed.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Clock3 className="size-5 text-primary" />
            <h2 className="font-display text-xl font-bold tracking-tight">{t('recentlyViewed')}</h2>
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
            <h2 className="font-display text-2xl font-bold tracking-tight">{t('discover')}</h2>
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
    const suggestion = search.q ? await suggestSearchTerm(user, search.q) : null;
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

async function NoResults({ search }: { search: RecipeSearch }) {
  const t = await getTranslations('recipe.library.noResults');
  const query = search.q?.trim();
  return (
    <EmptyState
      icon={<SearchX />}
      title={query ? t('titleWithQuery', { query }) : t('title')}
      description={t('body')}
      action={
        <>
          <Button asChild>
            <Link href="/recipes">
              <Compass /> {t('clearFilters')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            {/* Deep-link "create this recipe" with the searched term as a
                starting title, so a missing recipe becomes an invitation to add
                it (#103). Object href stays type-safe under typedRoutes. */}
            <Link
              href={{
                pathname: '/recipes/new',
                query: query ? { title: query } : undefined,
              }}
            >
              <ChefHat /> {query ? t('createWithQuery', { query }) : t('create')}
            </Link>
          </Button>
        </>
      }
    />
  );
}

async function ConnectDbNotice() {
  const t = await getTranslations('dbNotice');
  return (
    <EmptyState
      icon={<Database />}
      title={t('title')}
      description={t.rich('recipes', {
        code: (chunks: ReactNode) => (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{chunks}</code>
        ),
        file: (chunks: ReactNode) => <code className="font-mono text-sm">{chunks}</code>,
      })}
    />
  );
}

export default withRouteMessages(RecipesPage);
