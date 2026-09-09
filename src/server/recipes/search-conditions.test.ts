import { and } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// searchFilterConditions only touches `db` for free-text/tag EXISTS subqueries.
// every case here avoids those, so a bare stub keeps the import side-effect-free.
vi.mock('~/server/db', () => ({ db: {}, isDbConfigured: () => true }));

import { parseRecipeSearch } from './search';
import { searchFilterConditions } from './queries';

const dialect = new PgDialect({ casing: 'snake_case' });
const renderQuery = (...args: Parameters<typeof searchFilterConditions>) => {
  const conditions = searchFilterConditions(...args);
  const combined = and(...conditions);
  return combined ? dialect.sqlToQuery(combined) : { sql: '', params: [] };
};
const render = (...args: Parameters<typeof searchFilterConditions>): string => {
  return renderQuery(...args).sql.toLowerCase();
};

describe('searchFilterConditions (scoped facet counts, #274)', () => {
  it('includes every active filter by default', () => {
    const sql = render(
      parseRecipeSearch({
        cuisine: 'Italian',
        difficulty: 'easy',
        maxTime: '30',
      }),
    );
    expect(sql).toContain('cuisine');
    expect(sql).toContain('difficulty');
    expect(sql).toContain('total_minutes');
  });

  it('omits the cuisine predicate when counting cuisines (skip: cuisine)', () => {
    const search = parseRecipeSearch({
      cuisine: 'Italian',
      difficulty: 'easy',
      maxTime: '30',
    });
    const sql = render(search, { skip: 'cuisine' });
    // The cuisine facet drops out so its own values don't constrain the count,
    // but the other active filters still scope it.
    expect(sql).not.toContain('cuisine');
    expect(sql).toContain('difficulty');
    expect(sql).toContain('total_minutes');
  });

  it('drops the tag EXISTS clauses when counting tags (skip: tag)', () => {
    const search = parseRecipeSearch({
      tag: ['vegan', 'weeknight'],
      difficulty: 'easy',
    });
    // Only the difficulty filter should remain. No correlated tag subquery.
    const conditions = searchFilterConditions(search, { skip: 'tag' });
    expect(conditions).toHaveLength(1);
    expect(render(search, { skip: 'tag' })).not.toContain('exists');
  });

  it('ORs multiple selected cuisines together', () => {
    const sql = render(parseRecipeSearch({ cuisine: ['Italian', 'Thai'] }));
    expect(sql).toContain(' or ');
    expect((sql.match(/cuisine/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('uses the legacy cuisine scalar only when no typed cuisine exists', () => {
    const sql = render(parseRecipeSearch({ cuisine: 'Italian' }));
    expect(sql).toContain('not exists');
    expect((sql.match(/category/g) ?? []).length).toBe(2);
  });

  it('ANDs meal and cuisine facets', () => {
    const conditions = searchFilterConditions(
      parseRecipeSearch({ meal: 'Dinner', cuisine: 'Italian' }),
    );
    expect(conditions).toHaveLength(2);
    expect(render(parseRecipeSearch({ meal: 'Dinner', cuisine: 'Italian' }))).toContain(' and ');
  });

  it('ANDs multiple cuisines when requested', () => {
    const conditions = searchFilterConditions(
      parseRecipeSearch({ cuisine: ['Italian', 'Thai'], cuisineMatch: 'all' }),
    );
    expect(conditions).toHaveLength(2);
  });

  it('ORs selected meals within a category-aware tag predicate', () => {
    const sql = render(parseRecipeSearch({ meal: ['Breakfast', 'Brunch'] }));
    expect(sql).toContain('exists');
    expect(sql).toContain('category');
    expect(sql).toContain(' in ');
  });

  it('ANDs selected meals when requested', () => {
    const conditions = searchFilterConditions(
      parseRecipeSearch({ meal: ['Breakfast', 'Brunch'], mealMatch: 'all' }),
    );
    expect(conditions).toHaveLength(2);
  });

  it('ORs selected general tags when requested', () => {
    const conditions = searchFilterConditions(
      parseRecipeSearch({ tag: ['weeknight', 'favorite'], tagMatch: 'any' }),
    );
    expect(conditions).toHaveLength(1);
    expect(
      render(parseRecipeSearch({ tag: ['weeknight', 'favorite'], tagMatch: 'any' })),
    ).toContain(' or ');
  });
});

describe('searchFilterConditions. Dietary filter (#273)', () => {
  it('matches a diet against current assessments and author declarations', () => {
    const sql = render(parseRecipeSearch({ diet: 'gluten-free' }));
    expect(sql).toContain('dietary_flags');
    expect(sql).toContain('ruleset_version');
    expect(sql).toContain('dietary_assessments');
    expect(sql).toContain(' or ');
  });

  it('vetoes positive matches when a current deterministic conflict exists', () => {
    const sql = render(parseRecipeSearch({ diet: 'vegan' }));
    expect(sql).toContain('dietary_flags');
    expect(sql).not.toContain('dietary_tags');
    expect(sql).toContain('not exists');
  });

  it('AND-combines multiple selected diets in one dietary predicate', () => {
    const search = parseRecipeSearch({ diet: ['vegan', 'gluten-free'] });
    expect(searchFilterConditions(search)).toHaveLength(1);
    const sql = render(search);
    expect((sql.match(/dietary_flags/g) ?? []).length).toBe(2);
  });

  it('OR-combines multiple selected diets when requested', () => {
    const search = parseRecipeSearch({
      diet: ['vegan', 'gluten-free'],
      dietMatch: 'any',
    });
    expect(searchFilterConditions(search)).toHaveLength(1);
    expect(render(search)).toContain(' or ');
  });

  it('isolates medium-confidence possible matches from the high-confidence band', () => {
    const search = parseRecipeSearch({ diet: 'vegan' });
    const sql = render(search, { dietaryMatchBand: 'possible' });
    expect(sql).toContain('dietary_assessments');
    expect(sql).toContain('not (');
  });

  it('adds no dietary predicate when none is selected', () => {
    const sql = render(parseRecipeSearch({ cuisine: 'Italian' }));
    expect(sql).not.toContain('dietary_tags');
  });
});

describe('searchFilterConditions. Viewer-scoped params stay out (#91)', () => {
  it('emits no predicate for group or mine (they filter in searchRecipes)', () => {
    // `group`/`mine` need the viewer + their group ids, so they're applied in
    // `searchRecipes` (like `safeFor`), never in this pure, viewer-less builder.
    const search = parseRecipeSearch({ group: 'grp123', mine: '1' });
    expect(searchFilterConditions(search)).toHaveLength(0);
    const sql = render(search);
    expect(sql).not.toContain('group_id');
    expect(sql).not.toContain('author_id');
  });
});
