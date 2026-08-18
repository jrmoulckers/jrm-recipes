'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { loadMoreSearchAction } from '~/server/recipes/search-actions';
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
  initialNextOffset,
  queryString,
  canFavorite = false,
  favoritedIds = [],
  priorityCount = 0,
  members,
  quickPlan,
  correction,
  unrankable,
  macroNutrients = [],
  showingUncertain = false,
}: {
  initialItems: RecipeSearchResult[];
  initialNextOffset: number | null;
  /** Canonical query string of the effective search, re-parsed server-side. */
  queryString: string;
  canFavorite?: boolean;
  favoritedIds?: string[];
  priorityCount?: number;
  members?: CardDietaryMember[];
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
  const [items, setItems] = React.useState<RecipeSearchResult[]>(initialItems);
  const [nextOffset, setNextOffset] = React.useState<number | null>(initialNextOffset);
  const [pending, startTransition] = React.useTransition();
  const favoritedSet = React.useMemo(() => new Set(favoritedIds), [favoritedIds]);

  function onLoadMore() {
    if (nextOffset == null || pending) return;
    startTransition(async () => {
      const result = await loadMoreSearchAction(queryString, nextOffset);
      setItems((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const fresh = result.items.filter((r) => !seen.has(r.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
      setNextOffset(result.nextOffset);
    });
  }

  const hasMore = nextOffset != null;

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
            {t('searchResults.title')}
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
          />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="outline" size="lg" onClick={onLoadMore} disabled={pending}>
            {pending ? t('common.loading') : t('common.loadMoreRecipes')}
          </Button>
        </div>
      )}
    </section>
  );
}
