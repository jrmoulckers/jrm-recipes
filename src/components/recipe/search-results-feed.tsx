'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

import {
  loadMorePossibleSearchAction,
  loadMoreSearchAction,
} from '~/server/recipes/search-actions';
import { pathnameWithQuery } from '~/lib/routes';
import { type RecipeSearchResult } from '~/server/recipes/queries';
import { type UnrankableCounts } from '~/server/recipes/macro-search';
import { type MacroNutrientKey } from '~/server/recipes/search';
import { Button } from '~/components/ui/button';
import { RecipeCard, type QuickPlanContext } from '~/components/recipe/recipe-card';
import { type CardDietaryMember } from '~/components/recipe/card-dietary-badge';

/**
 * Search/filter results grid with a "Load more" button (#58).
 *
 * Results used to be silently capped at the first page and the header printed
 * that page's length as if it were the total. This owns incremental paging via
 * the load-more server action (re-parsing the active search from its query
 * string) and shows a `N+` hint whenever more results remain, so the count never
 * masquerades as a hard total. New items are de-duped by id.
 */
export function SearchResultsFeed({
  initialItems,
  initialPossibleItems = [],
  initialNextOffset,
  initialPossibleItems = [],
  initialPossibleNextOffset = null,
  showDietaryBands = false,
  queryString,
  canFavorite = false,
  favoritedIds = [],
  priorityCount = 0,
  members,
  signedIn = false,
  quickPlan,
  correction,
  unrankable,
  macroNutrients = [],
  showingUncertain = false,
}: {
  initialItems: RecipeSearchResult[];
  initialPossibleItems?: RecipeSearchResult[];
  initialNextOffset: number | null;
  initialPossibleItems?: RecipeSearchResult[];
  initialPossibleNextOffset?: number | null;
  showDietaryBands?: boolean;
  /** Canonical query string of the effective search, re-parsed server-side. */
  queryString: string;
  canFavorite?: boolean;
  favoritedIds?: string[];
  priorityCount?: number;
  members?: CardDietaryMember[];
  signedIn?: boolean;
  quickPlan?: QuickPlanContext;
  correction?: { from: string; to: string };
  /**
   * What the macro confidence gate held back (#1047). Disclosed rather than
   * silently subtracted: a shorter list with no explanation is its own kind of
   * dishonesty, because the viewer reads it as "these are all the recipes".
   */
  unrankable?: UnrankableCounts;
  /** Nutrients the cards print — the ones the search ranked on. */
  macroNutrients?: MacroNutrientKey[];
  /** True when the viewer opted into seeing the low-confidence matches. */
  showingUncertain?: boolean;
}) {
  const t = useTranslations('recipe');
  const [page, setPage] = React.useState(() => ({
    queryString,
    items: initialItems,
    nextOffset: initialNextOffset,
  }));
  const [possiblePage, setPossiblePage] = React.useState(() => ({
    queryString,
    items: initialPossibleItems,
    nextOffset: initialPossibleNextOffset,
  }));
  const [pending, startTransition] = React.useTransition();
  const [possiblePending, startPossibleTransition] = React.useTransition();
  const favoritedSet = React.useMemo(() => new Set(favoritedIds), [favoritedIds]);
  const currentQuery = React.useRef(queryString);
  currentQuery.current = queryString;

  // Client state owns pages appended by "Load more", but a new filter query
  // must immediately use the new server result instead of retaining the first
  // query's state until a hard refresh.
  const currentPage =
    page.queryString === queryString
      ? page
      : { queryString, items: initialItems, nextOffset: initialNextOffset };
  const { items, nextOffset } = currentPage;
  const currentPossiblePage =
    possiblePage.queryString === queryString
      ? possiblePage
      : {
          queryString,
          items: initialPossibleItems,
          nextOffset: initialPossibleNextOffset,
        };
  const { items: possibleItems, nextOffset: possibleNextOffset } = currentPossiblePage;

  function onLoadMore() {
    if (nextOffset == null || pending) return;
    const requestedQuery = queryString;
    const requestedItems = items;
    startTransition(async () => {
      const result = await loadMoreSearchAction(requestedQuery, nextOffset);
      if (currentQuery.current !== requestedQuery) return;
      setPage((previousPage) => {
        const previousItems =
          previousPage.queryString === requestedQuery ? previousPage.items : requestedItems;
        const seen = new Set(previousItems.map((r) => r.id));
        const fresh = result.items.filter((r) => !seen.has(r.id));
        return {
          queryString: requestedQuery,
          items: fresh.length > 0 ? [...previousItems, ...fresh] : previousItems,
          nextOffset: result.nextOffset,
        };
      });
    });
  }

  function onLoadMorePossible() {
    if (possibleNextOffset == null || pending) return;
    const requestedQuery = queryString;
    const requestedItems = possibleItems;
    startTransition(async () => {
      const result = await loadMoreSearchAction(requestedQuery, possibleNextOffset);
      if (currentQuery.current !== requestedQuery) return;
      setPossiblePage((previousPage) => {
        const previousItems =
          previousPage.queryString === requestedQuery ? previousPage.items : requestedItems;
        const seen = new Set(previousItems.map((recipe) => recipe.id));
        const fresh = result.possibleItems.filter((recipe) => !seen.has(recipe.id));
        return {
          queryString: requestedQuery,
          items: fresh.length > 0 ? [...previousItems, ...fresh] : previousItems,
          nextOffset: result.possibleNextOffset,
        };
      });
    });
  }

  const hasMore = nextOffset != null;
  const hasMorePossible = possibleNextOffset != null;

  // The escape hatch. Withholding is the default because a filtered list is
  // read as an answer, but the viewer is entitled to overrule us and see what
  // we were unsure about — clearly marked, never silently mixed in.
  const toggleHref = React.useMemo(() => {
    const params = new URLSearchParams(queryString);
    if (showingUncertain) params.delete('showUncertain');
    else params.set('showUncertain', '1');
    return pathnameWithQuery('/recipes', params.toString());
  }, [queryString, showingUncertain]);

  const withheldLow = unrankable?.lowConfidence ?? 0;
  const withheldUnknown = unrankable?.unknown ?? 0;
  const showDisclosure = showingUncertain || withheldLow > 0 || withheldUnknown > 0;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            {showDietaryBands ? t('searchResults.highTitle') : t('searchResults.title')}
          </h2>
          {correction && (
            <p className="text-sm text-muted-foreground">
              {t.rich('searchResults.correction', {
                from: correction.from,
                to: correction.to,
                strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
              })}
            </p>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {t('searchResults.count', {
            count: items.length,
            plus: hasMore ? '+' : '',
          })}
        </span>
      </div>
      {showDisclosure && (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          role="status"
        >
          <p>
            {showingUncertain
              ? t('searchResults.withheld.showing')
              : [
                  withheldLow > 0
                    ? t('searchResults.withheld.lowConfidence', { count: withheldLow })
                    : null,
                  withheldUnknown > 0
                    ? t('searchResults.withheld.unknown', { count: withheldUnknown })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
          </p>
          {(showingUncertain || withheldLow > 0) && (
            <Link
              href={toggleHref}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {showingUncertain
                ? t('searchResults.withheld.hide')
                : t('searchResults.withheld.show', { count: withheldLow })}
            </Link>
          )}
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((recipe, i) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            canFavorite={canFavorite}
            favorited={favoritedSet.has(recipe.id)}
            quickPlan={quickPlan}
            priority={i < priorityCount}
            matchReason={recipe.matchReason}
            macro={recipe.macro}
            macroNutrients={macroNutrients}
            members={members}
            signedIn={signedIn}
          />
        ))}
      </div>
      {possibleItems.length > 0 ? (
        <section className="mt-3 grid gap-4" aria-labelledby="possible-dietary-matches">
          <div>
            <h3
              id="possible-dietary-matches"
              className="font-display text-xl font-semibold text-foreground"
            >
              {t('searchResults.possible.title')}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t('searchResults.possible.description')}
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {possibleItems.map((recipe) => (
              <RecipeCard
                key={`possible:${recipe.id}`}
                recipe={recipe}
                canFavorite={canFavorite}
                favorited={favoritedSet.has(recipe.id)}
                quickPlan={quickPlan}
                matchReason={recipe.matchReason}
                members={members}
                signedIn={signedIn}
              />
            ))}
          </div>
          {possibleNextOffset != null && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={onLoadMorePossible}
                disabled={possiblePending}
              >
                {possiblePending ? t('common.loading') : t('common.loadMoreRecipes')}
              </Button>
            </div>
          )}
        </section>
      ) : null}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="outline" size="lg" onClick={onLoadMore} disabled={pending}>
            {pending ? t('common.loading') : t('common.loadMoreRecipes')}
          </Button>
        </div>
      )}
      {showDietaryBands && possibleItems.length > 0 && (
        <section
          className="flex flex-col gap-5 border-t border-border pt-5"
          aria-labelledby="possible-dietary-matches"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <h2
                id="possible-dietary-matches"
                className="font-display text-2xl font-bold tracking-tight"
              >
                {t('searchResults.possibleTitle')}
              </h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('searchResults.possibleDescription')}
              </p>
            </div>
            <span className="text-sm text-muted-foreground">
              {t('searchResults.count', {
                count: possibleItems.length,
                plus: hasMorePossible ? '+' : '',
              })}
            </span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {possibleItems.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                canFavorite={canFavorite}
                favorited={favoritedSet.has(recipe.id)}
                quickPlan={quickPlan}
                matchReason={recipe.matchReason}
                macro={recipe.macro}
                macroNutrients={macroNutrients}
                members={members}
              />
            ))}
          </div>
          {hasMorePossible && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={onLoadMorePossible}
                disabled={pending}
              >
                {pending ? t('common.loading') : t('searchResults.loadMorePossible')}
              </Button>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
