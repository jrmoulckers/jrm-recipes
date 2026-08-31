import { describe, expect, it } from 'vitest';

import {
  evaluateChunkExpectations,
  manifestRouteForKey,
  resolveRouteChunks,
} from './route-chunk-attribution.mjs';

const manifest = {
  pages: {
    '/_not-found/page': ['static/chunks/not-found.js'],
    '/(main)/recipes/[cook]/[recipe]/page': [
      'static/chunks/framework.js',
      'static/chunks/recipe.js',
    ],
  },
};

describe('route chunk attribution (#1055)', () => {
  it('maps route groups out of App Router manifest keys', () => {
    expect(manifestRouteForKey('/(main)/recipes/[cook]/[recipe]/page')).toBe(
      '/recipes/[cook]/[recipe]',
    );
    expect(manifestRouteForKey('/(main)/page')).toBe('/');
    expect(manifestRouteForKey('/(main)/layout')).toBeNull();
  });

  it('selects only the requested route first-load chunks', () => {
    expect(resolveRouteChunks(manifest, '/recipes/[cook]/[recipe]')).toEqual([
      'static/chunks/framework.js',
      'static/chunks/recipe.js',
    ]);
  });

  it('proves absence only alongside a working positive control', () => {
    const chunks = resolveRouteChunks(manifest, '/recipes/[cook]/[recipe]');
    const contents = new Map([
      ['static/chunks/framework.js', 'function useState() {}'],
      ['static/chunks/recipe.js', 'const ingredient = "buttermilk";'],
    ]);
    const { rows, failed } = evaluateChunkExpectations(
      chunks,
      [
        { expected: 'absent', query: 'recipeCard.macroEstimated' },
        { expected: 'present', query: 'useState' },
      ],
      (chunk) => contents.get(chunk),
    );

    expect(failed).toBe(false);
    expect(rows[0]).toMatchObject({ query: 'recipeCard.macroEstimated', hits: 0, passed: true });
    expect(rows[1]).toMatchObject({ query: 'useState', hits: 1, passed: true });
  });

  it('fails when an allegedly absent module marker reaches the route', () => {
    const { rows, failed } = evaluateChunkExpectations(
      ['static/chunks/recipe.js'],
      [
        { expected: 'absent', query: 'recipeCard.macroEstimated' },
        { expected: 'present', query: 'useState' },
      ],
      () => 'useState recipeCard.macroEstimated',
    );
    expect(failed).toBe(true);
    expect(rows[0]).toMatchObject({ hits: 1, passed: false });
  });

  it('refuses an absence result without a positive control', () => {
    expect(() =>
      evaluateChunkExpectations(
        ['static/chunks/recipe.js'],
        [{ expected: 'absent', query: 'recipeCard.macroEstimated' }],
        () => '',
      ),
    ).toThrow(/positive control/);
  });
});
