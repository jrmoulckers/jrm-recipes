"use client";

import * as React from "react";
import Link from "next/link";
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
import { type SavedSearch } from "~/server/searches/queries";

/** Sentinel for "no filter" — Radix Select forbids empty-string item values. */
const ANY = "any";

const TIME_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

type Facets = {
  cuisines: { value: string; count: number }[];
  tags: { slug: string; name: string; count: number }[];
};

/** A saved family member the results can be filtered "safe for". */
type SafeForMember = { id: string; name: string };

type ParamKey =
  | "q"
  | "cuisine"
  | "difficulty"
  | "maxTime"
  | "tag"
  | "safeFor"
  | "sort";

export function RecipeSearchControls({
  search,
  facets,
  savedSearches = [],
  members = [],
}: {
  search: RecipeSearch;
  facets: Facets;
  savedSearches?: SavedSearch[];
  members?: SafeForMember[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const searchId = React.useId();
  const filtersId = React.useId();
  const [query, setQuery] = React.useState(search.q ?? "");
  // On phones the filter row collapses behind a "Filters" disclosure so the
  // recipes stay near the top; desktop keeps the inline row (#90).
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [, startTransition] = React.useTransition();

  // Reflect URL changes driven elsewhere (back/forward, Clear) into the input.
  React.useEffect(() => {
    setQuery(search.q ?? "");
  }, [search.q]);

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

  // Multi-select facets (cuisine, tag) carry several repeated params; replace the
  // whole set atomically so toggling one value never drops the others.
  const pushListParam = React.useCallback(
    (key: "cuisine" | "tag", values: string[]) => {
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
    (key: "cuisine" | "tag", current: string[], value: string, on: boolean) => {
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
    const id = window.setTimeout(() => pushParams({ q: next || undefined }), 300);
    return () => window.clearTimeout(id);
  }, [query, search.q, pushParams]);

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

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (search.q) {
    activeChips.push({
      key: "q",
      label: `“${search.q}”`,
      onRemove: () => {
        setQuery("");
        pushParams({ q: undefined });
      },
    });
  }
  for (const cuisine of search.cuisines) {
    activeChips.push({
      key: `cuisine:${cuisine}`,
      label: `Cuisine: ${cuisine}`,
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
      label: `Difficulty: ${search.difficulty}`,
      onRemove: () => pushParams({ difficulty: undefined }),
    });
  }
  if (search.maxTime != null) {
    activeChips.push({
      key: "maxTime",
      label: `≤ ${search.maxTime} min`,
      onRemove: () => pushParams({ maxTime: undefined }),
    });
  }
  for (const tag of search.tags) {
    const name = tagNameBySlug.get(tag.toLowerCase()) ?? tag;
    activeChips.push({
      key: `tag:${tag}`,
      label: `Tag: ${name}`,
      onRemove: () =>
        pushListParam(
          "tag",
          search.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()),
        ),
    });
  }
  if (search.safeFor) {
    const name = memberNameById.get(search.safeFor);
    activeChips.push({
      key: "safeFor",
      label: name ? `Safe for: ${name}` : "Safe for",
      onRemove: () => pushParams({ safeFor: undefined }),
    });
  }

  // Active filters excluding the free-text query, for the mobile trigger badge.
  const filterCount = activeChips.length - (search.q ? 1 : 0);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface/50 p-4">
      <div className="flex flex-wrap items-center gap-2" aria-label="Quick filters">
        <span className="text-xs font-medium text-muted-foreground">
          Quick picks
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
          Search recipes
        </Label>
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search recipes, ingredients, cuisines, tags…"
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
              Filters
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
        {facets.cuisines.length > 0 && (
          <FacetMultiSelect
            label="Cuisine"
            placeholder="Any cuisine"
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
                label: `${c.value} (${c.count})`,
              }))}
            onToggle={(value, on) =>
              toggleListValue("cuisine", search.cuisines, value, on)
            }
          />
        )}

        <FilterField label="Difficulty">
          <Select
            value={search.difficulty ?? ANY}
            onValueChange={(value) => pushParams({ difficulty: value })}
          >
            <SelectTrigger className="min-w-[8rem]">
              <SelectValue placeholder="Any level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any level</SelectItem>
              {recipeDifficultyValues.map((level) => (
                <SelectItem key={level} value={level} className="capitalize">
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Max time">
          <Select
            value={search.maxTime != null ? String(search.maxTime) : ANY}
            onValueChange={(value) => pushParams({ maxTime: value })}
          >
            <SelectTrigger className="min-w-[8rem]">
              <SelectValue placeholder="Any time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any time</SelectItem>
              {TIME_OPTIONS.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {minutes} min or less
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        {facets.tags.length > 0 && (
          <FacetMultiSelect
            label="Tag"
            placeholder="Any tag"
            selected={search.tags}
            options={facets.tags
              .filter(
                (t) =>
                  t.count > 0 ||
                  search.tags.some((s) => s.toLowerCase() === t.slug),
              )
              .map((t) => ({
                value: t.slug,
                label: `${t.name} (${t.count})`,
              }))}
            onToggle={(value, on) =>
              toggleListValue("tag", search.tags, value, on)
            }
          />
        )}

        <FilterField label="Safe for">
          {members.length > 0 ? (
            <Select
              value={search.safeFor ?? ANY}
              onValueChange={(value) => pushParams({ safeFor: value })}
            >
              <SelectTrigger className="min-w-[9rem]">
                <SelectValue placeholder="Anyone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Anyone</SelectItem>
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
                <ShieldCheck className="text-muted-foreground" /> Add a profile
              </Link>
            </Button>
          )}
        </FilterField>

        <FilterField label="Sort">
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
              startTransition(() => router.push(pathnameWithQuery(pathname), { scroll: false }));
            }}
            className={cn("text-muted-foreground")}
          >
            <X /> Clear
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
          aria-label="Active filters"
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
                <span className="sr-only">— remove filter</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {search.safeFor != null && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
          Best-effort filtering from ingredient names and declared diets. Always
          double-check labels for allergies.
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
            aria-label={`${label} filter, ${count} selected`}
          >
            <span className={cn(count === 0 && "text-muted-foreground")}>
              {count === 0 ? placeholder : `${count} selected`}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="max-h-72 w-56 overflow-y-auto p-1.5"
        >
          <ul className="flex flex-col">
            {options.map((option) => {
              const checked = selectedSet.has(option.value.toLowerCase());
              return (
                <li key={option.value}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={checked}
                      onChange={(event) =>
                        onToggle(option.value, event.target.checked)
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
