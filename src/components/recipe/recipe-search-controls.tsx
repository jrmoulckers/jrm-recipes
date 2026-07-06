"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  DEFAULT_RECIPE_SORT,
  hasActiveRecipeFilters,
  recipeDifficultyValues,
  recipeSortLabels,
  recipeSortValues,
  type RecipeSearch,
} from "~/server/recipes/search";

/** Sentinel for "no filter" — Radix Select forbids empty-string item values. */
const ANY = "any";

const TIME_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

type Facets = { cuisines: string[]; tags: { slug: string; name: string }[] };

type ParamKey = "q" | "cuisine" | "difficulty" | "maxTime" | "tag" | "sort";

export function RecipeSearchControls({
  search,
  facets,
}: {
  search: RecipeSearch;
  facets: Facets;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const searchId = React.useId();
  const [query, setQuery] = React.useState(search.q ?? "");
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
      // Keep the default sort out of the URL so shared links stay clean.
      if (params.get("sort") === DEFAULT_RECIPE_SORT) params.delete("sort");
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface/50 p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Label htmlFor={searchId} className="sr-only">
          Search recipes
        </Label>
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search recipes, ingredients, cuisines, tags…"
          className="pl-10"
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {facets.cuisines.length > 0 && (
          <FilterField label="Cuisine">
            <Select
              value={search.cuisine ?? ANY}
              onValueChange={(value) => pushParams({ cuisine: value })}
            >
              <SelectTrigger className="min-w-[9rem]">
                <SelectValue placeholder="Any cuisine" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any cuisine</SelectItem>
                {facets.cuisines.map((cuisine) => (
                  <SelectItem key={cuisine} value={cuisine}>
                    {cuisine}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
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
          <FilterField label="Tag">
            <Select
              value={search.tag ?? ANY}
              onValueChange={(value) => pushParams({ tag: value })}
            >
              <SelectTrigger className="min-w-[9rem]">
                <SelectValue placeholder="Any tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any tag</SelectItem>
                {facets.tags.map((tag) => (
                  <SelectItem key={tag.slug} value={tag.slug}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        )}

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
              startTransition(() => router.push(pathname, { scroll: false }));
            }}
            className={cn("text-muted-foreground")}
          >
            <X /> Clear
          </Button>
        )}
      </div>
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
