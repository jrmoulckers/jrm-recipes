'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronDown, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';

import { cn, slugify } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { Switch } from '~/components/ui/switch';
import { SavedSearches } from '~/components/recipe/saved-searches';
import { pathnameWithQuery } from '~/lib/routes';
import {
  RECIPE_PRESETS,
  isPresetActive,
  togglePreset,
  type RecipePreset,
} from '~/lib/recipe-presets';
import {
  type ClassificationOption,
  isClassificationActive,
  pickBrowseClassifications,
  toggleClassification,
} from '~/lib/recipe-classification-filters';
import {
  activeMacroFilters,
  defaultSortFor,
  hasActiveRecipeFilters,
  MACRO_FILTERS,
  parseRecipeSearch,
  recipeDifficultyValues,
  recipeSortLabels,
  recipeSortValues,
  type MacroFilterParam,
  type RecipeSearch,
} from '~/server/recipes/search';
import { type SearchParams } from '~/lib/route-params';
import { DIETARY_TAGS, DIETARY_TAG_LABELS } from '~/lib/substitutions';
import { type SavedSearch } from '~/server/searches/queries';

/** Sentinel for "no filter". Radix Select forbids empty-string item values. */
const ANY = 'any';

const TIME_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

/** How many classification chips the always-visible browse row offers. */
const BROWSE_CLASSIFICATION_COUNT = 12;

/** How many saved family members become their own "Safe for" quick pick. */
const SAFE_FOR_QUICK_PICKS = 2;

/** Milliseconds of typing pause before a free-text filter navigates. */
const TEXT_DEBOUNCE_MS = 250;

type Facets = {
  cuisines: { value: string; count: number }[];
  meals: { slug: string; name: string; count: number }[];
  tags: { slug: string; name: string; count: number }[];
};

/** A saved family member the results can be filtered "safe for". */
type SafeForMember = { id: string; name: string };

/** A family/group the viewer belongs to, for the group filter (#91). */
type GroupOption = { id: string; name: string };

type ParamKey =
  | 'q'
  | 'meal'
  | 'cuisine'
  | 'difficulty'
  | 'maxTime'
  | 'tag'
  | 'diet'
  | 'safeFor'
  | 'group'
  | 'mine'
  | 'ingredient'
  | 'sort'
  | 'minProtein'
  | 'maxCalories'
  | 'maxCarbs'
  | 'showUncertain';

/**
 * Preset bounds per macro filter (#1047). Presets rather than free numbers: a
 * dropdown keeps the URL canonical, keeps every value inside the parser's
 * bound, and matches the existing "max time" affordance.
 */
const MACRO_OPTIONS: Record<MacroFilterParam, number[]> = {
  minProtein: [10, 20, 30, 40],
  maxCalories: [300, 400, 500, 700],
  maxCarbs: [20, 30, 50, 75],
};

/** Re-shape live `URLSearchParams` into the record `parseRecipeSearch` reads. */
function toSearchParamsRecord(params: URLSearchParams): SearchParams {
  const record: SearchParams = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    record[key] = values.length > 1 ? values : values[0];
  }
  return record;
}

/**
 * Filters that only exist inside the "More filters" panel. Meals, cuisines and
 * tags are excluded because the always-visible classification row already shows
 * them, so selecting "Dinner" must not force the advanced panel open.
 */
function advancedFilterCount(search: RecipeSearch): number {
  return (
    (search.difficulty != null ? 1 : 0) +
    (search.maxTime != null ? 1 : 0) +
    search.diets.length +
    (search.safeFor != null ? 1 : 0) +
    (search.group != null ? 1 : 0) +
    (search.ingredient != null ? 1 : 0) +
    activeMacroFilters(search).length +
    (search.mine ? 1 : 0)
  );
}

export function RecipeSearchControls({
  search,
  facets,
  classifications = [],
  savedSearches = [],
  members = [],
  groups = [],
  signedIn = false,
}: {
  search: RecipeSearch;
  facets: Facets;
  classifications?: ClassificationOption[];
  savedSearches?: SavedSearch[];
  members?: SafeForMember[];
  groups?: GroupOption[];
  signedIn?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations('recipeSearch');
  const tLibrary = useTranslations('recipe.library');
  const tDifficulty = useTranslations('recipeDetail.difficulty');
  const tNames = useTranslations('classificationNames');
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const searchId = React.useId();
  const filtersId = React.useId();
  const [query, setQuery] = React.useState(search.q ?? '');
  const [ingredient, setIngredient] = React.useState(search.ingredient ?? '');
  // Progressive disclosure (#661): the long facet grid stays folded away at
  // every breakpoint until asked for, so the card leads with search. It starts
  // open only when the incoming URL already carries one of its filters, so a
  // shared link never hides the reason the results look narrow.
  const [filtersOpen, setFiltersOpen] = React.useState(() => advancedFilterCount(search) > 0);
  const [isPending, startTransition] = React.useTransition();

  // Optimistic querystring (#661). Every control renders from this instead of
  // the committed URL, so a chip lights up on the click that requested it
  // rather than when the server navigation lands. React discards the optimistic
  // value once the transition settles, at which point the committed params say
  // the same thing.
  const committedQuery = currentParams.toString();
  const [optimisticQuery, setOptimisticQuery] = React.useOptimistic(committedQuery);
  const activeParams = React.useMemo(() => new URLSearchParams(optimisticQuery), [optimisticQuery]);
  // The optimistic params are always ones we built, so parsing them cannot
  // realistically fail; falling back to the server's search keeps a malformed
  // hand-typed URL from blanking the controls.
  const activeSearch = React.useMemo(() => {
    try {
      return parseRecipeSearch(toSearchParamsRecord(activeParams));
    } catch {
      return search;
    }
  }, [activeParams, search]);

  // Reflect URL changes driven elsewhere (back/forward, Clear) into the input.
  React.useEffect(() => {
    setQuery(search.q ?? '');
  }, [search.q]);

  // Keep the ingredient input in sync with URL-driven changes (chips, Clear).
  React.useEffect(() => {
    setIngredient(search.ingredient ?? '');
  }, [search.ingredient]);

  const navigate = React.useCallback(
    (params: URLSearchParams) => {
      // Keep the contextual default sort out of the URL so shared links stay
      // clean: `relevance` when a query is present, `newest` otherwise.
      const effectiveDefault = defaultSortFor(params.get('q'));
      if (params.get('sort') === effectiveDefault) params.delete('sort');
      const qs = params.toString();
      startTransition(() => {
        setOptimisticQuery(qs);
        router.push(pathnameWithQuery(pathname, qs), { scroll: false });
      });
    },
    [pathname, router, setOptimisticQuery],
  );

  // Every mutation composes onto the *optimistic* params, so two quick taps
  // stack instead of the second one racing the first back to the old URL.
  const pushParams = React.useCallback(
    (updates: Partial<Record<ParamKey, string | undefined>>) => {
      const params = new URLSearchParams(activeParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value.length === 0 || value === ANY) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      navigate(params);
    },
    [activeParams, navigate],
  );

  // Multi-select facets carry several repeated params. Replace the
  // whole set atomically so toggling one value never drops the others.
  const pushListParam = React.useCallback(
    (key: 'meal' | 'cuisine' | 'tag' | 'diet', values: string[]) => {
      const params = new URLSearchParams(activeParams.toString());
      params.delete(key);
      for (const value of values) params.append(key, value);
      navigate(params);
    },
    [activeParams, navigate],
  );

  const toggleListValue = React.useCallback(
    (key: 'meal' | 'cuisine' | 'tag' | 'diet', current: string[], value: string, on: boolean) => {
      const lower = value.toLowerCase();
      const next = on ? [...current, value] : current.filter((v) => v.toLowerCase() !== lower);
      pushListParam(key, next);
    },
    [pushListParam],
  );

  // Preset chips (#378): compose several existing params in one tap. Reuses the
  // pure toggle from recipe-presets so the result stays a shareable URL.
  const pushPreset = React.useCallback(
    (preset: RecipePreset) => {
      navigate(togglePreset(activeParams, preset));
    },
    [activeParams, navigate],
  );

  // Debounce the free-text query so we navigate once the user pauses.
  React.useEffect(() => {
    const next = query.trim();
    if (next === (search.q ?? '')) return;
    const id = window.setTimeout(() => pushParams({ q: next || undefined }), TEXT_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query, search.q, pushParams]);

  // Debounce the ingredient filter the same way. The server resolves the term to
  // a canonical food and constrains results to recipes that use it.
  React.useEffect(() => {
    const next = ingredient.trim();
    if (next === (search.ingredient ?? '')) return;
    const id = window.setTimeout(
      () => pushParams({ ingredient: next || undefined }),
      TEXT_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(id);
  }, [ingredient, search.ingredient, pushParams]);

  const filtersActive = hasActiveRecipeFilters(activeSearch);

  /**
   * Quick picks (#661) lead with the viewer's own context — their recipes, the
   * family members they saved a dietary profile for — before the generic
   * presets, so the first row of the card is about them.
   */
  const quickPicks = React.useMemo<RecipePreset[]>(() => {
    const personalized: RecipePreset[] = [];
    if (signedIn) {
      personalized.push({
        id: 'mine',
        label: t('myRecipes'),
        description: t('onlyMyRecipes'),
        params: [{ key: 'mine', value: '1' }],
      });
    }
    for (const member of members.slice(0, SAFE_FOR_QUICK_PICKS)) {
      personalized.push({
        id: `safe-for:${member.id}`,
        label: t('quickPick.safeFor', { name: member.name }),
        description: t('safeForNote'),
        params: [{ key: 'safeFor', value: member.id }],
      });
    }
    return [...personalized, ...RECIPE_PRESETS];
  }, [members, signedIn, t]);

  /**
   * The always-visible classification row. It used to live in the browse-only
   * section, so choosing "Dinner" deleted it; keeping it here means the row
   * survives the switch to results and simply highlights what is applied.
   */
  const browseClassifications = React.useMemo(
    () => pickBrowseClassifications(classifications, activeParams, BROWSE_CLASSIFICATION_COUNT),
    [classifications, activeParams],
  );

  const classificationLabel = React.useCallback(
    (item: ClassificationOption) => {
      const name = tNames.has(item.slug) ? tNames(item.slug) : item.name;
      return item.category === 'general' ? `#${name}` : name;
    },
    [tNames],
  );

  // Human-readable, individually removable chips for every active filter (#87).
  // Each knows how to clear only its own param while preserving the rest.
  const tagNameBySlug = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of facets.tags) map.set(t.slug.toLowerCase(), t.name);
    return map;
  }, [facets.tags]);
  const memberNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.id, m.name);
    return map;
  }, [members]);
  const groupNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) map.set(g.id, g.name);
    return map;
  }, [groups]);

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (activeSearch.q) {
    activeChips.push({
      key: 'q',
      label: t('chip.query', { q: activeSearch.q }),
      onRemove: () => {
        setQuery('');
        pushParams({ q: undefined });
      },
    });
  }
  for (const meal of activeSearch.meals) {
    const name = facets.meals.find((item) => item.slug === meal.toLowerCase())?.name ?? meal;
    const slug = meal.toLowerCase();
    activeChips.push({
      key: `meal:${meal}`,
      label: t('chip.meal', {
        value: tNames.has(slug) ? tNames(slug) : name,
      }),
      onRemove: () =>
        pushListParam(
          'meal',
          activeSearch.meals.filter((value) => value.toLowerCase() !== meal.toLowerCase()),
        ),
    });
  }
  for (const cuisine of activeSearch.cuisines) {
    const slug = slugify(cuisine);
    activeChips.push({
      key: `cuisine:${cuisine}`,
      label: t('chip.cuisine', {
        value: tNames.has(slug) ? tNames(slug) : cuisine,
      }),
      onRemove: () =>
        pushListParam(
          'cuisine',
          activeSearch.cuisines.filter((c) => c.toLowerCase() !== cuisine.toLowerCase()),
        ),
    });
  }
  if (activeSearch.difficulty) {
    activeChips.push({
      key: 'difficulty',
      label: t('chip.difficulty', {
        value: tDifficulty(activeSearch.difficulty),
      }),
      onRemove: () => pushParams({ difficulty: undefined }),
    });
  }
  if (activeSearch.maxTime != null) {
    activeChips.push({
      key: 'maxTime',
      label: t('chip.maxTime', { minutes: activeSearch.maxTime }),
      onRemove: () => pushParams({ maxTime: undefined }),
    });
  }
  for (const tag of activeSearch.tags) {
    const slug = tag.toLowerCase();
    const name = tagNameBySlug.get(slug) ?? tag;
    activeChips.push({
      key: `tag:${tag}`,
      label: t('chip.tag', {
        value: tNames.has(slug) ? tNames(slug) : name,
      }),
      onRemove: () =>
        pushListParam(
          'tag',
          activeSearch.tags.filter((v) => v.toLowerCase() !== slug),
        ),
    });
  }
  for (const diet of activeSearch.diets) {
    activeChips.push({
      key: `diet:${diet}`,
      label: t('chip.diet', { value: DIETARY_TAG_LABELS[diet] }),
      onRemove: () =>
        pushListParam(
          'diet',
          activeSearch.diets.filter((d) => d !== diet),
        ),
    });
  }
  if (activeSearch.safeFor) {
    const name = memberNameById.get(activeSearch.safeFor);
    activeChips.push({
      key: 'safeFor',
      label: name ? t('chip.safeForNamed', { name }) : t('field.safeFor'),
      onRemove: () => pushParams({ safeFor: undefined }),
    });
  }
  if (activeSearch.group) {
    const name = groupNameById.get(activeSearch.group);
    activeChips.push({
      key: 'group',
      label: name ? t('chip.familyNamed', { name }) : t('field.family'),
      onRemove: () => pushParams({ group: undefined }),
    });
  }
  if (activeSearch.ingredient) {
    activeChips.push({
      key: 'ingredient',
      label: t('chip.ingredient', { value: activeSearch.ingredient }),
      onRemove: () => {
        setIngredient('');
        pushParams({ ingredient: undefined });
      },
    });
  }
  for (const active of activeMacroFilters(activeSearch)) {
    activeChips.push({
      key: `macro:${active.param}`,
      label: t(`chip.${active.param}`, { amount: active.value }),
      onRemove: () => pushParams({ [active.param]: undefined }),
    });
  }
  if (activeSearch.mine) {
    activeChips.push({
      key: 'mine',
      label: t('field.onlyMine'),
      onRemove: () => pushParams({ mine: undefined }),
    });
  }

  const advancedCount = advancedFilterCount(activeSearch);

  const clearAll = () => {
    setQuery('');
    setIngredient('');
    navigate(new URLSearchParams());
  };

  return (
    <div
      aria-busy={isPending}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface/50 p-4"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Label htmlFor={searchId} className="sr-only">
          {t('searchLabel')}
        </Label>
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('searchPlaceholder')}
          className="pe-10 ps-10"
        />
        <span className="absolute end-3 top-1/2 -translate-y-1/2">
          {isPending ? (
            <Spinner label={t('updating')} className="text-muted-foreground" />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('clearSearch')}
              className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </span>
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t('quickFiltersAria')}
      >
        <span className="text-xs font-medium text-muted-foreground">{t('quickPicks')}</span>
        {quickPicks.map((preset) => (
          <ChipButton
            key={preset.id}
            active={isPresetActive(activeParams, preset)}
            title={preset.description}
            onClick={() => pushPreset(preset)}
          >
            {preset.label}
          </ChipButton>
        ))}
      </div>

      {browseClassifications.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={tLibrary('browseByTag')}
        >
          <span className="text-xs font-medium text-muted-foreground">
            {tLibrary('browseByTag')}
          </span>
          {browseClassifications.map((item) => (
            <ChipButton
              key={`${item.category}:${item.slug}`}
              active={isClassificationActive(activeParams, item)}
              onClick={() => navigate(toggleClassification(activeParams, item))}
            >
              {classificationLabel(item)}
              <span className="text-xs tabular-nums opacity-70">{item.count}</span>
            </ChipButton>
          ))}
          <Button asChild variant="ghost" size="sm" className="ms-auto">
            <Link href="/recipes/tags">{tLibrary('allTags')}</Link>
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            className="font-normal"
          >
            <SlidersHorizontal className="size-4" />
            {t('filters')}
            {advancedCount > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {advancedCount}
              </span>
            )}
            <ChevronDown
              className={cn(
                'size-4 shrink-0 opacity-60 transition-transform',
                filtersOpen && 'rotate-180',
              )}
            />
          </Button>

          <Select value={activeSearch.sort} onValueChange={(value) => pushParams({ sort: value })}>
            <SelectTrigger className="min-w-[8rem]" aria-label={t('field.sort')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {recipeSortValues.map((option) => (
                <SelectItem key={option} value={option}>
                  {recipeSortLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ms-auto">
            <SavedSearches
              savedSearches={savedSearches}
              currentQuery={optimisticQuery}
              filtersActive={filtersActive}
            />
          </div>
        </div>

        <div
          id={filtersId}
          className={cn(
            'flex-wrap items-end gap-3 border-t border-border pt-3',
            filtersOpen ? 'flex' : 'hidden',
          )}
        >
          {facets.meals.length > 0 && (
            <FacetMultiSelect
              label={t('field.meal')}
              placeholder={t('anyMeal')}
              selected={activeSearch.meals}
              options={facets.meals
                .filter(
                  (meal) =>
                    meal.count > 0 ||
                    activeSearch.meals.some((selected) => selected.toLowerCase() === meal.slug),
                )
                .map((meal) => ({
                  value: meal.slug,
                  label: `${tNames.has(meal.slug) ? tNames(meal.slug) : meal.name} (${meal.count})`,
                }))}
              onToggle={(value, on) => toggleListValue('meal', activeSearch.meals, value, on)}
            />
          )}

          {facets.cuisines.length > 0 && (
            <FacetMultiSelect
              label={t('field.cuisine')}
              placeholder={t('anyCuisine')}
              selected={activeSearch.cuisines}
              options={facets.cuisines
                .filter(
                  (c) =>
                    c.count > 0 ||
                    activeSearch.cuisines.some((s) => s.toLowerCase() === c.value.toLowerCase()),
                )
                .map((c) => {
                  const slug = slugify(c.value);
                  return {
                    value: c.value,
                    label: `${tNames.has(slug) ? tNames(slug) : c.value} (${c.count})`,
                  };
                })}
              onToggle={(value, on) => toggleListValue('cuisine', activeSearch.cuisines, value, on)}
            />
          )}

          <FilterField label={t('field.difficulty')}>
            <Select
              value={activeSearch.difficulty ?? ANY}
              onValueChange={(value) => pushParams({ difficulty: value })}
            >
              <SelectTrigger className="min-w-[8rem]">
                <SelectValue placeholder={t('anyLevel')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t('anyLevel')}</SelectItem>
                {recipeDifficultyValues.map((level) => (
                  <SelectItem key={level} value={level}>
                    {tDifficulty(level)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label={t('field.maxTime')}>
            <Select
              value={activeSearch.maxTime != null ? String(activeSearch.maxTime) : ANY}
              onValueChange={(value) => pushParams({ maxTime: value })}
            >
              <SelectTrigger className="min-w-[8rem]">
                <SelectValue placeholder={t('anyTime')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t('anyTime')}</SelectItem>
                {TIME_OPTIONS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {t('minutesOrLess', { minutes })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          {facets.tags.length > 0 && (
            <FacetMultiSelect
              label={t('field.tag')}
              placeholder={t('anyTag')}
              selected={activeSearch.tags}
              options={facets.tags
                .filter(
                  (t) => t.count > 0 || activeSearch.tags.some((s) => s.toLowerCase() === t.slug),
                )
                .map((t) => ({
                  value: t.slug,
                  label: `${tNames.has(t.slug) ? tNames(t.slug) : t.name} (${t.count})`,
                }))}
              onToggle={(value, on) => toggleListValue('tag', activeSearch.tags, value, on)}
            />
          )}

          <FacetMultiSelect
            label={t('field.dietary')}
            placeholder={t('anyDiet')}
            selected={activeSearch.diets}
            options={DIETARY_TAGS.map((tag) => ({
              value: tag,
              label: tNames.has(tag) ? tNames(tag) : DIETARY_TAG_LABELS[tag],
            }))}
            onToggle={(value, on) => toggleListValue('diet', activeSearch.diets, value, on)}
          />

          <FilterField label={t('field.ingredient')}>
            <Input
              type="search"
              value={ingredient}
              onChange={(event) => setIngredient(event.target.value)}
              placeholder={t('ingredientPlaceholder')}
              aria-label={t('ingredientAria')}
              className="min-w-[9rem]"
            />
          </FilterField>

          <FilterField label={t('field.safeFor')}>
            {members.length > 0 ? (
              <Select
                value={activeSearch.safeFor ?? ANY}
                onValueChange={(value) => pushParams({ safeFor: value })}
              >
                <SelectTrigger className="min-w-[9rem]">
                  <SelectValue placeholder={t('anyone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>{t('anyone')}</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button asChild variant="outline" className="min-w-[9rem] justify-start font-normal">
                <Link href="/settings/dietary">
                  <ShieldCheck className="text-muted-foreground" /> {t('addProfile')}
                </Link>
              </Button>
            )}
          </FilterField>

          {groups.length > 0 && (
            <FilterField label={t('field.family')}>
              <Select
                value={activeSearch.group ?? ANY}
                onValueChange={(value) => pushParams({ group: value })}
              >
                <SelectTrigger className="min-w-[9rem]">
                  <SelectValue placeholder={t('anyFamily')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>{t('anyFamily')}</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          )}

          {MACRO_FILTERS.map((def) => (
            <FilterField key={def.param} label={t(`field.${def.param}`)}>
              <Select
                value={activeSearch[def.param] != null ? String(activeSearch[def.param]) : ANY}
                onValueChange={(value) => pushParams({ [def.param]: value })}
              >
                <SelectTrigger className="min-w-[9rem]">
                  <SelectValue placeholder={t('anyAmount')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>{t('anyAmount')}</SelectItem>
                  {MACRO_OPTIONS[def.param].map((amount) => (
                    <SelectItem key={amount} value={String(amount)}>
                      {t(`macroOption.${def.param}`, { amount })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          ))}

          {signedIn && (
            <FilterField label={t('field.onlyMine')}>
              <label className="inline-flex h-10 items-center gap-2">
                <Switch
                  checked={activeSearch.mine}
                  onCheckedChange={(on) => pushParams({ mine: on ? '1' : undefined })}
                  aria-label={t('onlyMyRecipes')}
                />
                <span className="text-sm text-muted-foreground">{t('myRecipes')}</span>
              </label>
            </FilterField>
          )}
        </div>
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <ul aria-label={t('activeFiltersAria')} className="flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pe-1.5 ps-3 text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="max-w-[14rem] truncate">{chip.label}</span>
                  <span
                    aria-hidden
                    className="inline-flex size-4 items-center justify-center rounded-full bg-muted text-muted-foreground"
                  >
                    <X className="size-3" />
                  </span>
                  <span className="sr-only">{t('removeFilter')}</span>
                </button>
              </li>
            ))}
          </ul>
          {filtersActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="text-muted-foreground"
            >
              <X /> {t('clear')}
            </Button>
          )}
        </div>
      )}

      {activeSearch.safeFor != null && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
          {t('safeForNote')}
        </p>
      )}
    </div>
  );
}

/**
 * The shared pill for both one-tap rows (quick picks and classifications).
 * `aria-pressed` is what makes "selected" audible: the row stays put and the
 * chip reports its own state instead of the page changing underneath.
 */
function ChipButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent',
      )}
    >
      {active && <Check className="size-3.5" aria-hidden />}
      {children}
    </button>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * A checkbox popover for a multi-value facet. Selection state lives in the URL
 * (repeated params), so `onToggle` reports each add/remove and the parent
 * rewrites the whole set. Matching is case-insensitive so URL-supplied values
 * still light up their option.
 */
function FacetMultiSelect({
  label,
  placeholder,
  options,
  selected,
  onToggle,
}: {
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string, on: boolean) => void;
}) {
  const t = useTranslations('recipeSearch');
  const selectedSet = React.useMemo(
    () => new Set(selected.map((v) => v.toLowerCase())),
    [selected],
  );
  const count = options.reduce((n, o) => n + (selectedSet.has(o.value.toLowerCase()) ? 1 : 0), 0);
  return (
    <FilterField label={label}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="min-w-[9rem] justify-between font-normal"
            aria-label={t('facetAria', { label, count })}
          >
            <span className={cn(count === 0 && 'text-muted-foreground')}>
              {count === 0 ? placeholder : t('facetSelected', { count })}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={label}
          className="max-h-72 w-56 overflow-y-auto p-1.5"
        >
          <ul className="flex flex-col">
            {options.map((option) => {
              const checked = selectedSet.has(option.value.toLowerCase());
              return (
                <li key={option.value}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => onToggle(option.value, value === true)}
                    />
                    <span className="truncate">{option.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </FilterField>
  );
}
