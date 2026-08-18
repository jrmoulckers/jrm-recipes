import { and } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('~/server/db', () => ({ db: {}, isDbConfigured: () => true }));

import { parseRecipeSearch, recipeSearchToParams, isMacroSort } from './search';
import {
  MACRO_CONFIDENCE_FLOOR,
  macroCardNutrients,
  macroFilterConditions,
  macroOrderBy,
  macroRequirements,
  toMacroCardSummary,
} from './macro-search';

const dialect = new PgDialect({ casing: 'snake_case' });

const renderWhere = (params: Record<string, string | string[]>): string => {
  const conditions = macroFilterConditions(parseRecipeSearch(params));
  const combined = and(...conditions);
  return combined ? dialect.sqlToQuery(combined).sql.toLowerCase() : '';
};

const renderOrder = (params: Record<string, string | string[]>): string => {
  const order = macroOrderBy(parseRecipeSearch(params));
  if (!order) return '';
  return order.map((sql) => dialect.sqlToQuery(sql).sql.toLowerCase()).join(', ');
};

describe('macro search params (#1047)', () => {
  it('parses and round-trips every macro bound', () => {
    const search = parseRecipeSearch({
      minProtein: '30',
      maxCalories: '500',
      maxCarbs: '20',
    });
    expect(search.minProtein).toBe(30);
    expect(search.maxCalories).toBe(500);
    expect(search.maxCarbs).toBe(20);

    const params = recipeSearchToParams(search);
    expect(params.get('minProtein')).toBe('30');
    expect(params.get('maxCalories')).toBe('500');
    expect(params.get('maxCarbs')).toBe('20');
  });

  it('round-trips the opt-in to uncertain results', () => {
    const search = parseRecipeSearch({ minProtein: '30', showUncertain: '1' });
    expect(search.showUncertain).toBe(true);
    expect(recipeSearchToParams(search).get('showUncertain')).toBe('1');
    expect(parseRecipeSearch({}).showUncertain).toBe(false);
  });

  it('clamps an over-bound value instead of dropping the filter', () => {
    // Dropping it would silently widen the search the user asked to narrow.
    expect(parseRecipeSearch({ minProtein: '99999' }).minProtein).toBe(500);
  });

  it('ignores junk and negative values', () => {
    expect(parseRecipeSearch({ minProtein: 'lots' }).minProtein).toBeUndefined();
    expect(parseRecipeSearch({ maxCalories: '-100' }).maxCalories).toBeUndefined();
  });

  it('recognizes the macro sorts', () => {
    expect(isMacroSort(parseRecipeSearch({ sort: 'protein-high' }).sort)).toBe(true);
    expect(isMacroSort(parseRecipeSearch({ sort: 'calories-low' }).sort)).toBe(true);
    expect(isMacroSort(parseRecipeSearch({ sort: 'newest' }).sort)).toBe(false);
  });
});

describe('macroRequirements (#1047)', () => {
  it('is empty when the search touches no nutrition', () => {
    expect(macroRequirements(parseRecipeSearch({ q: 'soup' }))).toEqual([]);
  });

  it('turns each bound into a requirement', () => {
    expect(macroRequirements(parseRecipeSearch({ minProtein: '30', maxCalories: '500' }))).toEqual([
      { nutrient: 'proteinGrams', kind: 'min', value: 30 },
      { nutrient: 'calories', kind: 'max', value: 500 },
    ]);
  });

  it('requires the sorted nutrient to be present, so nothing is ranked blind', () => {
    expect(macroRequirements(parseRecipeSearch({ sort: 'protein-high' }))).toEqual([
      { nutrient: 'proteinGrams', kind: 'present' },
    ]);
  });

  it('does not add a presence requirement a bound already covers', () => {
    const reqs = macroRequirements(parseRecipeSearch({ sort: 'protein-high', minProtein: '30' }));
    expect(reqs).toEqual([{ nutrient: 'proteinGrams', kind: 'min', value: 30 }]);
  });
});

describe('macroFilterConditions (#1047)', () => {
  it('adds nothing when the search touches no nutrition', () => {
    expect(macroFilterConditions(parseRecipeSearch({ q: 'soup' }))).toEqual([]);
  });

  it('reads the cook s own columns and the versioned cache, in that order', () => {
    const sql = renderWhere({ minProtein: '30' });
    // Manual branch: the recipe's own per-serving column.
    expect(sql).toContain('protein_grams');
    // Derived branch: an EXISTS against the cache, never a recomputation.
    expect(sql).toContain('exists');
    expect(sql).toContain('recipe_nutrition_cache');
    expect(sql).toContain('resolver_version');
  });

  it('gates the derived branch on the confidence floor', () => {
    const sql = renderWhere({ minProtein: '30' });
    expect(sql).toContain('rnc.confidence >=');
    const { params } = dialect.sqlToQuery(
      and(...macroFilterConditions(parseRecipeSearch({ minProtein: '30' })))!,
    );
    expect(params).toContain(MACRO_CONFIDENCE_FLOOR);
  });

  it('drops the floor only when the viewer opts in', () => {
    expect(renderWhere({ minProtein: '30', showUncertain: '1' })).not.toContain(
      'rnc.confidence >=',
    );
  });

  it('requires presence for a macro sort even with no bound', () => {
    expect(renderWhere({ sort: 'protein-high' })).toContain('is not null');
  });
});

describe('macroOrderBy (#1047)', () => {
  it('is null for a non-macro sort, leaving the existing ordering alone', () => {
    expect(macroOrderBy(parseRecipeSearch({ sort: 'newest' }))).toBeNull();
  });

  it('ranks protein high to low, with a stable tiebreak', () => {
    const sql = renderOrder({ sort: 'protein-high' });
    expect(sql).toContain('desc');
    expect(sql).toContain('lower(');
  });

  it('ranks calories low to high', () => {
    expect(renderOrder({ sort: 'calories-low' })).toContain('asc');
  });

  it('repeats the confidence gate so it cannot rank on a value the filter refused', () => {
    expect(renderOrder({ sort: 'protein-high' })).toContain('rnc.confidence >=');
  });
});

describe('toMacroCardSummary (#1047)', () => {
  const perServing = { calories: 420, proteinGrams: 31 };

  it('is null when there is nothing to show', () => {
    expect(toMacroCardSummary(undefined)).toBeNull();
    expect(
      toMacroCardSummary({ perServing: {}, provenance: { source: 'none' } } as never),
    ).toBeNull();
  });

  it("never marks the cook's own figures uncertain", () => {
    const summary = toMacroCardSummary({
      perServing,
      provenance: { source: 'manual' },
    } as never);
    expect(summary).toMatchObject({ source: 'manual', confidence: null, uncertain: false });
  });

  it('marks a derived figure below the floor', () => {
    const below = toMacroCardSummary({
      perServing,
      provenance: { source: 'estimate', confidence: MACRO_CONFIDENCE_FLOOR - 0.1 },
    } as never);
    expect(below?.uncertain).toBe(true);

    const at = toMacroCardSummary({
      perServing,
      provenance: { source: 'estimate', confidence: MACRO_CONFIDENCE_FLOOR },
    } as never);
    expect(at?.uncertain).toBe(false);
  });
});

describe('macroCardNutrients (#1047)', () => {
  it('is empty when nothing ranked on nutrition, so no card prints a figure', () => {
    expect(macroCardNutrients(parseRecipeSearch({ q: 'soup' }))).toEqual([]);
  });

  it('prints exactly the nutrients the search ranked on, without duplicates', () => {
    expect(
      macroCardNutrients(
        parseRecipeSearch({ minProtein: '30', maxCalories: '500', sort: 'protein-high' }),
      ),
    ).toEqual(['proteinGrams', 'calories']);
  });
});
