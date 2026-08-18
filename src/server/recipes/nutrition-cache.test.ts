import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import { nutritionResolverVersion } from '~/lib/nutrition-version';
import type { RecipeNutritionView } from '~/lib/recipe-nutrition';

import {
  fromCacheValues,
  readCachedNutritionView,
  sanitizeNutrition,
  toCacheValues,
  type NutritionCacheValues,
} from './nutrition-cache';
import type { NutritionDb } from './nutrition-compute';

/**
 * The cache's contract, tested where it can be tested without a database: the
 * serialization boundary, and the version filter that makes a stale row a miss.
 *
 * The two properties that matter most are both about *not losing a
 * distinction*:
 *  - a nutrient nothing sourced must come back absent, not `0` (#1028);
 *  - a derived estimate must never come back looking like a cook's own numbers
 *    (#1029).
 */

const graphView: RecipeNutritionView = {
  perServing: { calories: 240, proteinGrams: 0, fatGrams: 9.5 },
  provenance: {
    source: 'graph',
    confidence: 0.72,
    sourcedLines: 4,
    totalLines: 6,
    unresolvedLines: [
      { label: '6 eggs', reason: 'weight' },
      { label: 'a pinch of magic', reason: 'facts' },
    ],
  },
};

/** A full trip through Postgres `jsonb`: object → text → object. */
function throughJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function roundTrip(view: RecipeNutritionView): RecipeNutritionView {
  const values = toCacheValues(view);
  expect(values).not.toBeNull();
  const stored = values as NutritionCacheValues;
  return fromCacheValues({
    source: stored.source,
    perServing: throughJson(stored.perServing),
    confidence: stored.confidence,
    sourcedLines: stored.sourcedLines,
    totalLines: stored.totalLines,
    unresolvedLines: throughJson(stored.unresolvedLines),
  });
}

describe('absent is not zero, in both directions', () => {
  it('keeps an unsourced nutrient absent across a round trip', () => {
    const back = roundTrip(graphView);
    // Never sourced → must not appear at all.
    expect('carbsGrams' in back.perServing).toBe(false);
    expect('sodiumMg' in back.perServing).toBe(false);
    expect(back.perServing.carbsGrams).toBeUndefined();
  });

  it('keeps a genuine zero as zero across a round trip', () => {
    const back = roundTrip(graphView);
    expect(back.perServing.proteinGrams).toBe(0);
    expect('proteinGrams' in back.perServing).toBe(true);
  });

  it('does not confuse the two: absent ≠ 0 after storage', () => {
    const back = roundTrip(graphView);
    expect(back.perServing.proteinGrams).not.toBe(back.perServing.carbsGrams);
  });

  it('drops a stored null rather than reading it as 0', () => {
    // `Nutrition` admits null (rows read straight off `recipes`), and a stored
    // null is just a heavier-weight absence — never a measured zero.
    expect(sanitizeNutrition({ calories: null, proteinGrams: 0 })).toEqual({ proteinGrams: 0 });
  });

  it('drops non-numbers and keys the registry does not declare', () => {
    expect(
      sanitizeNutrition({ calories: 'lots', fatGrams: NaN, vitaminQ: 12, sugarGrams: 3 }),
    ).toEqual({ sugarGrams: 3 });
  });

  it('survives a non-object payload without inventing values', () => {
    expect(sanitizeNutrition(null)).toEqual({});
    expect(sanitizeNutrition('{}')).toEqual({});
  });
});

describe('provenance is stored with the values', () => {
  it('round trips the tag, confidence, line counts and unresolved lines', () => {
    const back = roundTrip(graphView);
    expect(back.provenance).toEqual({
      source: 'graph',
      confidence: 0.72,
      sourcedLines: 4,
      totalLines: 6,
      // Round-tripped rather than recomputed: recomputing means resolving every
      // line again, which is the work the cache exists to avoid.
      unresolvedLines: [
        { label: '6 eggs', reason: 'weight' },
        { label: 'a pinch of magic', reason: 'facts' },
      ],
    });
  });

  it('preserves `estimate` distinctly from `graph`', () => {
    const back = roundTrip({
      perServing: { calories: 100 },
      provenance: {
        source: 'estimate',
        confidence: 0.4,
        sourcedLines: 1,
        totalLines: 3,
        unresolvedLines: [],
      },
    });
    expect(back.provenance.source).toBe('estimate');
  });

  it('refuses to store a manual view at all', () => {
    // A cook's own numbers already live on `recipes` and short-circuit the
    // resolver. Caching them would make a derived number indistinguishable from
    // an override — the exact ambiguity #1029 removed.
    expect(
      toCacheValues({ perServing: { calories: 500 }, provenance: { source: 'manual' } }),
    ).toBeNull();
  });

  it('stores `none` as a real, cacheable answer', () => {
    const values = toCacheValues({ perServing: {}, provenance: { source: 'none' } });
    expect(values).toEqual({
      source: 'none',
      perServing: {},
      confidence: null,
      sourcedLines: null,
      totalLines: null,
      unresolvedLines: null,
    });
    expect(fromCacheValues({ ...values!, unresolvedLines: null })).toEqual({
      perServing: {},
      provenance: { source: 'none' },
    });
  });

  it('discards an unresolved entry with an unknown reason rather than trusting it', () => {
    const back = fromCacheValues({
      source: 'graph',
      perServing: { calories: 10 },
      confidence: 0.5,
      sourcedLines: 1,
      totalLines: 2,
      unresolvedLines: [{ label: 'x', reason: 'cosmic rays' }, 'nope'],
    });
    expect(back.provenance).toMatchObject({ unresolvedLines: [] });
  });
});

/**
 * A fake `db` that behaves like the real one for the single query
 * `readCachedNutritionView` issues: it compiles the `where` clause and only
 * returns the stored row when the resolver version the query asked for matches
 * the version the row was written under.
 */
function fakeDb(row: { version: string; values: Record<string, unknown> } | null) {
  const dialect = new PgDialect();
  return {
    select: () => ({
      from: () => ({
        where: (condition: SQL) => ({
          limit: () => {
            const { params } = dialect.sqlToQuery(condition);
            const matches = row != null && params.includes(row.version);
            return Promise.resolve(matches ? [row.values] : []);
          },
        }),
      }),
    }),
  } as unknown as NutritionDb;
}

describe('a resolver-version bump busts the cache', () => {
  const stored = {
    source: 'graph',
    perServing: { calories: 240 },
    confidence: 0.9,
    sourcedLines: 3,
    totalLines: 3,
    unresolvedLines: [],
  };

  it('returns a row written under the current version', async () => {
    const db = fakeDb({ version: nutritionResolverVersion(), values: stored });
    const view = await readCachedNutritionView(db, 'r1');
    expect(view?.perServing).toEqual({ calories: 240 });
    expect(view?.provenance.source).toBe('graph');
  });

  it('treats a row written under an older version as a miss', async () => {
    // This is the whole point of versioning: after #1030 revises the portion
    // gram weights, these numbers answer a question nobody is asking any more.
    const db = fakeDb({ version: 'n1.stale0000', values: stored });
    expect(await readCachedNutritionView(db, 'r1')).toBeNull();
  });

  it('reports a miss rather than throwing when the read fails', async () => {
    const broken = {
      select: () => {
        throw new Error('connection lost');
      },
    } as unknown as NutritionDb;
    expect(await readCachedNutritionView(broken, 'r1')).toBeNull();
  });
});
