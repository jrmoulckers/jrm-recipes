"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { SavedSearches } from "~/components/recipe/saved-searches";
import { pathnameWithQuery } from "~/lib/routes";
import {
  RECIPE_PRESETS,
  isPresetActive,
  togglePreset,
} from "~/lib/recipe-presets";
import {
  defaultSortFor,
  hasActiveRecipeFilters,
  recipeDifficultyValues,
  recipeSortLabels,
  recipeSortValues,
  type RecipeSearch,
} from "~/server/recipes/search";
import { DIETARY_TAGS, DIETARY_TAG_LABELS } from "~/lib/substitutions";
import { type SavedSearch } from "~/server/searches/queries";
import { canonicalizeTag } from "~/lib/tag-taxonomy";

/** Sentinel for "no filter". Radix Select forbids empty-string item values. */
const ANY = "any";

const TIME_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

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
  | "q"
  | "meal"
  | "cuisine"
  | "difficulty"
  | "maxTime"
  | "tag"
  | "diet"
  | "safeFor"
  | "group"
  | "mine"
  | "ingredient"
  | "sort";

export function RecipeSearchControls({
  search,
  facets,
  savedSearches = [],
  members = [],
  groups = [],
  signedIn = false,
}: {
  search: RecipeSearch;
  facets: Facets;
  savedSearches?: SavedSearch[];
  members?: SafeForMember[];
  groups?: GroupOption[];
  signedIn?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("recipeSearch");
  const tDifficulty = useTranslations("recipeDetail.difficulty");
  const tNames = useTranslations("classificationNames");
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const searchId = React.useId();
  const filtersId = React.useId();
  const [query, setQuery] = React.useState(search.q ?? "");
  const [ingredient, setIngredient] = React.useState(search.ingredient ?? "");
  // On phones the filter row collapses behind a "Filters" disclosure so the
  // recipes stay near the top. Desktop keeps the inline row (#90).
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [, startTransition] = React.useTransition();

  // Reflect URL changes driven elsewhere (back/forward, Clear) into the input.
  React.useEffect(() => {
    setQuery(search.q ?? "");
  }, [search.q]);

  // Keep the ingredient input in sync with URL-driven changes (chips, Clear).
  React.useEffect(() => {
    setIngredient(search.ingredient ?? "");
  }, [search.ingredient]);

  const pushParams = React.useCallback(
    (updates: Partial<Record<ParamKey, string | undefined>>) => {
      const params = new URLSearchParams(currentParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value.length === 0 || value === ANY) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      // Keep the contextual default sort out of the URL so shared links stay
      // clean: `relevance` when a query is present, `newest` otherwise.
      const effectiveDefault = defaultSortFor(params.get("q"));
      if (params.get("sort") === effectiveDefault) params.delete("sort");
      const qs = params.toString();
      startTransition(() => {
        router.push(pathnameWithQuery(pathname, qs), { scroll: false });
      });
    },
    [currentParams, pathname, router],
  );

  // Multi-select facets carry several repeated params. Replace the
  // whole set atomically so toggling one value never drops the others.
  const pushListParam = React.useCallback(
    (key: "meal" | "cuisine" | "tag" | "diet", values: string[]) => {
      const params = new URLSearchParams(currentParams.toString());
      params.delete(key);
      for (const value of values) params.append(key, value);
      const effectiveDefault = defaultSortFor(params.get("q"));
      if (params.get("sort") === effectiveDefault) params.delete("sort");
      const qs = params.toString();
      startTransition(() => {
        router.push(pathnameWithQuery(pathname, qs), { scroll: false });
      });
    },
    [currentParams, pathname, router],
  );

  const toggleListValue = React.useCallback(
    (
      key: "meal" | "cuisine" | "tag" | "diet",
      current: string[],
      value: string,
      on: boolean,
    ) => {
      const lower = value.toLowerCase();
      const next = on
        ? [...current, value]
        : current.filter((v) => v.toLowerCase() !== lower);
      pushListParam(key, next);
    },
    [pushListParam],
  );

  // Preset chips (#378): compose several existing params in one tap. Reuses the
  // pure toggle from recipe-presets so the result stays a shareable URL.
  const pushPreset = React.useCallback(
    (presetId: string) => {
      const preset = RECIPE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      const params = togglePreset(
        new URLSearchParams(currentParams.toString()),
        preset,
      );
      const effectiveDefault = defaultSortFor(params.get("q"));
      if (params.get("sort") === effectiveDefault) params.delete("sort");
      const qs = params.toString();
      startTransition(() => {
        router.push(pathnameWithQuery(pathname, qs), { scroll: false });
      });
    },
    [currentParams, pathname, router],
  );

  // Debounce the free-text query so we navigate once the user pauses.
  React.useEffect(() => {
    const next = query.trim();
    if (next === (search.q ?? "")) return;
    const id = window.setTimeout(
      () => pushParams({ q: next || undefined }),
      300,
    );
    return () => window.clearTimeout(id);
  }, [query, search.q, pushParams]);

  // Debounce the ingredient filter the same way. The server resolves the term to
  // a canonical food and constrains results to recipes that use it.
  React.useEffect(() => {
    const next = ingredient.trim();
    if (next === (search.ingredient ?? "")) return;
    const id = window.setTimeout(
      () => pushParams({ ingredient: next || undefined }),
      300,
    );
    return () => window.clearTimeout(id);
  }, [ingredient, search.ingredient, pushParams]);

  const filtersActive = hasActiveRecipeFilters(search);

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

  const activeChips: { key: string; label: string; onRemove: () => void }[] =
    [];
  if (search.q) {
    activeChips.push({
      key: "q",
      label: t("chip.query", { q: search.q }),
      onRemove: () => {
        setQuery("");
        pushParams({ q: undefined });
      },
    });
  }
  for (const meal of search.meals) {
    const name =
      facets.meals.find((item) => item.slug === meal.toLowerCase())?.name ??
      meal;
    const slug = canonicalizeTag(name, "meal").slug;
    activeChips.push({
      key: `meal:${meal}`,
      label: t("chip.meal", {
        value: tNames.has(slug) ? tNames(slug) : name,
      }),
      onRemove: () =>
        pushListParam(
          "meal",
          search.meals.filter(
            (value) => value.toLowerCase() !== meal.toLowerCase(),
          ),
        ),
    });
  }
  for (const cuisine of search.cuisines) {
    const slug = canonicalizeTag(cuisine, "cuisine").slug;
    activeChips.push({
      key: `cuisine:${cuisine}`,
      label: t("chip.cuisine", {
        value: tNames.has(slug) ? tNames(slug) : cuisine,
      }),
      onRemove: () =>
        pushListParam(
          "cuisine",
          search.cuisines.filter(
            (c) => c.toLowerCase() !== cuisine.toLowerCase(),
          ),
        ),
    });
  }
  if (search.difficulty) {
    activeChips.push({
      key: "difficulty",
      label: t("chip.difficulty", { value: tDifficulty(search.difficulty) }),
      onRemove: () => pushParams({ difficulty: undefined }),
    });
  }
  if (search.maxTime != null) {
    activeChips.push({
      key: "maxTime",
      label: t("chip.maxTime", { minutes: search.maxTime }),
      onRemove: () => pushParams({ maxTime: undefined }),
    });
  }
  for (const tag of search.tags) {
    const name = tagNameBySlug.get(tag.toLowerCase()) ?? tag;
    activeChips.push({
      key: `tag:${tag}`,
      label: t("chip.tag", { value: name }),
      onRemove: () =>
        pushListParam(
          "tag",
          search.tags.filter((v) => v.toLowerCase() !== tag.toLowerCase()),
        ),
    });
  }
  for (const diet of search.diets) {
    activeChips.push({
      key: `diet:${diet}`,
      label: t("chip.diet", { value: DIETARY_TAG_LABELS[diet] }),
      onRemove: () =>
        pushListParam(
          "diet",
          search.diets.filter((d) => d !== diet),
        ),
    });
  }
  if (search.safeFor) {
    const name = memberNameById.get(search.safeFor);
    activeChips.push({
      key: "safeFor",
      label: name ? t("chip.safeForNamed", { name }) : t("field.safeFor"),
      onRemove: () => pushParams({ safeFor: undefined }),
    });
  }
  if (search.group) {
    const name = groupNameById.get(search.group);
    activeChips.push({
      key: "group",
      label: name ? t("chip.familyNamed", { name }) : t("field.family"),
      onRemove: () => pushParams({ group: undefined }),
    });
  }
  if (search.ingredient) {
    activeChips.push({
      key: "ingredient",
      label: t("chip.ingredient", { value: search.ingredient }),
      onRemove: () => {
        setIngredient("");
        pushParams({ ingredient: undefined });
      },
    });
  }
  if (search.mine) {
    activeChips.push({
      key: "mine",
      label: t("field.onlyMine"),
      onRemove: () => pushParams({ mine: undefined }),
    });
  }

  // Active filters excluding the free-text query, for the mobile trigger badge.
  const filterCount = activeChips.length - (search.q ? 1 : 0);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface/50 p-4">
      <div
        className="flex flex-wrap items-center gap-2"
        aria-label={t("quickFiltersAria")}
      >
        <span className="text-xs font-medium text-muted-foreground">
          {t("quickPicks")}
        </span>
        {RECIPE_PRESETS.map((preset) => {
          const active = isPresetActive(currentParams, preset);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => pushPreset(preset.id)}
              aria-pressed={active}
              title={preset.description}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
              )}
            >
              {active && <Check className="size-3.5" aria-hidden />}
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Label htmlFor={searchId} className="sr-only">
          {t("searchLabel")}
        </Label>
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="ps-10"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="md:hidden">
          <Button
            type="button"
            variant="outline"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            className="w-full justify-between font-normal"
          >
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="size-4" />
              {t("filters")}
              {filterCount > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                  {filterCount}
                </span>
              )}
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 opacity-60 transition-transform",
                filtersOpen && "rotate-180",
              )}
            />
          </Button>
        </div>

        <div
          id={filtersId}
          className={cn(
            "flex-wrap items-end gap-3 md:flex",
            filtersOpen ? "flex" : "hidden",
          )}
        >
          {facets.meals.length > 0 && (
            <FacetMultiSelect
              label={t("field.meal")}
              placeholder={t("anyMeal")}
              selected={search.meals}
              options={facets.meals
                .filter(
                  (meal) =>
                    meal.count > 0 ||
                    search.meals.some(
                      (selected) => selected.toLowerCase() === meal.slug,
                    ),
                )
                .map((meal) => ({
                  value: meal.slug,
                  label: `${
                    tNames.has(meal.slug) ? tNames(meal.slug) : meal.name
                  } (${meal.count})`,
                }))}
              onToggle={(value, on) =>
                toggleListValue("meal", search.meals, value, on)
              }
            />
          )}

          {facets.cuisines.length > 0 && (
            <FacetMultiSelect
              label={t("field.cuisine")}
              placeholder={t("anyCuisine")}
              selected={search.cuisines}
              options={facets.cuisines
                .filter(
                  (c) =>
                    c.count > 0 ||
                    search.cuisines.some(
                      (s) => s.toLowerCase() === c.value.toLowerCase(),
                    ),
                )
                .map((c) => ({
                  value: c.value,
                  label: `${
                    tNames.has(canonicalizeTag(c.value, "cuisine").slug)
                      ? tNames(canonicalizeTag(c.value, "cuisine").slug)
                      : c.value
                  } (${c.count})`,
                }))}
              onToggle={(value, on) =>
                toggleListValue("cuisine", search.cuisines, value, on)
              }
            />
          )}

          <FilterField label={t("field.difficulty")}>
            <Select
              value={search.difficulty ?? ANY}
              onValueChange={(value) => pushParams({ difficulty: value })}
            >
              <SelectTrigger className="min-w-[8rem]">
                <SelectValue placeholder={t("anyLevel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t("anyLevel")}</SelectItem>
                {recipeDifficultyValues.map((level) => (
                  <SelectItem key={level} value={level}>
                    {tDifficulty(level)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label={t("field.maxTime")}>
            <Select
              value={search.maxTime != null ? String(search.maxTime) : ANY}
              onValueChange={(value) => pushParams({ maxTime: value })}
            >
              <SelectTrigger className="min-w-[8rem]">
                <SelectValue placeholder={t("anyTime")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t("anyTime")}</SelectItem>
                {TIME_OPTIONS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {t("minutesOrLess", { minutes })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          {facets.tags.length > 0 && (
            <FacetMultiSelect
              label={t("field.tag")}
              placeholder={t("anyTag")}
              selected={search.tags}
              options={facets.tags
                .filter(
                  (t) =>
                    t.count > 0 ||
                    search.tags.some((s) => s.toLowerCase() === t.slug),
                )
                .map((t) => ({
                  value: t.slug,
                  label: `${
                    tNames.has(t.slug) ? tNames(t.slug) : t.name
                  } (${t.count})`,
                }))}
              onToggle={(value, on) =>
                toggleListValue("tag", search.tags, value, on)
              }
            />
          )}

          <FacetMultiSelect
            label={t("field.dietary")}
            placeholder={t("anyDiet")}
            selected={search.diets}
            options={DIETARY_TAGS.map((tag) => ({
              value: tag,
              label: tNames.has(tag) ? tNames(tag) : DIETARY_TAG_LABELS[tag],
            }))}
            onToggle={(value, on) =>
              toggleListValue("diet", search.diets, value, on)
            }
          />

          <FilterField label={t("field.ingredient")}>
            <Input
              type="search"
              value={ingredient}
              onChange={(event) => setIngredient(event.target.value)}
              placeholder={t("ingredientPlaceholder")}
              aria-label={t("ingredientAria")}
              className="min-w-[9rem]"
            />
          </FilterField>

          <FilterField label={t("field.safeFor")}>
            {members.length > 0 ? (
              <Select
                value={search.safeFor ?? ANY}
                onValueChange={(value) => pushParams({ safeFor: value })}
              >
                <SelectTrigger className="min-w-[9rem]">
                  <SelectValue placeholder={t("anyone")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>{t("anyone")}</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button
                asChild
                variant="outline"
                className="min-w-[9rem] justify-start font-normal"
              >
                <Link href="/settings/dietary">
                  <ShieldCheck className="text-muted-foreground" />{" "}
                  {t("addProfile")}
                </Link>
              </Button>
            )}
          </FilterField>

          {groups.length > 0 && (
            <FilterField label={t("field.family")}>
              <Select
                value={search.group ?? ANY}
                onValueChange={(value) => pushParams({ group: value })}
              >
                <SelectTrigger className="min-w-[9rem]">
                  <SelectValue placeholder={t("anyFamily")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>{t("anyFamily")}</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          )}

          {signedIn && (
            <FilterField label={t("field.onlyMine")}>
              <label className="inline-flex h-10 items-center gap-2">
                <Switch
                  checked={search.mine}
                  onCheckedChange={(on) =>
                    pushParams({ mine: on ? "1" : undefined })
                  }
                  aria-label={t("onlyMyRecipes")}
                />
                <span className="text-sm text-muted-foreground">
                  {t("myRecipes")}
                </span>
              </label>
            </FilterField>
          )}

          <FilterField label={t("field.sort")}>
            <Select
              value={search.sort}
              onValueChange={(value) => pushParams({ sort: value })}
            >
              <SelectTrigger className="min-w-[8rem]">
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
          </FilterField>

          {filtersActive && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setIngredient("");
                startTransition(() =>
                  router.push(pathnameWithQuery(pathname), { scroll: false }),
                );
              }}
              className={cn("text-muted-foreground")}
            >
              <X /> {t("clear")}
            </Button>
          )}

          <div className="ms-auto">
            <SavedSearches
              savedSearches={savedSearches}
              currentQuery={currentParams.toString()}
              filtersActive={filtersActive}
            />
          </div>
        </div>
      </div>

      {activeChips.length > 0 && (
        <ul
          aria-label={t("activeFiltersAria")}
          className="flex flex-wrap items-center gap-2"
        >
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
                <span className="sr-only">{t("removeFilter")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {search.safeFor != null && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
          {t("safeForNote")}
        </p>
      )}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
  const t = useTranslations("recipeSearch");
  const selectedSet = React.useMemo(
    () => new Set(selected.map((v) => v.toLowerCase())),
    [selected],
  );
  const count = options.reduce(
    (n, o) => n + (selectedSet.has(o.value.toLowerCase()) ? 1 : 0),
    0,
  );
  return (
    <FilterField label={label}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="min-w-[9rem] justify-between font-normal"
            aria-label={t("facetAria", { label, count })}
          >
            <span className={cn(count === 0 && "text-muted-foreground")}>
              {count === 0 ? placeholder : t("facetSelected", { count })}
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
                      onCheckedChange={(value) =>
                        onToggle(option.value, value === true)
                      }
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
