import { describe, expect, it } from 'vitest';

import {
  evaluateBudgetChanges,
  evaluateBudgets,
  parseFirstLoadJs,
  readBaseBudgetRoutes,
  REQUIRED_MARGIN_KB,
  toKb,
} from './check-bundle-budget.mjs';

// A representative slice of `next build` output, including ANSI colour codes,
// route groups, dynamic segments, and a byte-sized (not kB) Size column.
const SAMPLE_BUILD_OUTPUT = [
  'Route (app)                                Size     First Load JS',
  '┌ ƒ /                                      3.84 kB         120 kB',
  '├ ƒ /recipes                               11.6 kB         202 kB',
  '├ ƒ /recipes/[id]                          19.7 kB         234 kB',
  '├ ƒ /recipes/[id]/edit                       145 B         157 kB',
  '├ ○ /manifest.webmanifest                      0 B            0 B',
  '\u001b[90m└ ƒ /api/health\u001b[39m                          0 B            0 B',
  '+ First Load JS shared by all              104 kB',
].join('\n');

describe('parseFirstLoadJs (#206)', () => {
  const parsed = parseFirstLoadJs(SAMPLE_BUILD_OUTPUT);

  it('reads the last size column (First Load JS) per route', () => {
    expect(parsed.get('/')).toBeCloseTo(120);
    expect(parsed.get('/recipes')).toBeCloseTo(202);
    expect(parsed.get('/recipes/[id]')).toBeCloseTo(234);
  });

  it('handles dynamic segments and byte-sized Size columns', () => {
    // 157 kB is the First Load JS even though Size is 145 B on that row.
    expect(parsed.get('/recipes/[id]/edit')).toBeCloseTo(157);
  });

  it('strips ANSI colour codes before parsing', () => {
    expect(parsed.has('/api/health')).toBe(true);
  });

  it('ignores the header and shared-JS summary lines', () => {
    expect(parsed.has('/manifest.webmanifest')).toBe(true);
    // No bare "Route" or "+ First Load JS" keys leak in as routes.
    for (const key of parsed.keys()) {
      expect(key.startsWith('/')).toBe(true);
    }
  });
});

describe('toKb (#206)', () => {
  it('normalises B, kB, and MB to kB', () => {
    expect(toKb(2048, 'B')).toBeCloseTo(2);
    expect(toKb(120, 'kB')).toBe(120);
    expect(toKb(1, 'MB')).toBe(1024);
  });
});

describe('evaluateBudgets NEAR band (issue #778)', () => {
  const budgets = { '/': 225, '/recipes': 255 };

  it('reports zero headroom as NEAR without failing the gate', () => {
    const measured = new Map([
      ['/', 225],
      ['/recipes', 240],
    ]);
    const { failed, rows } = evaluateBudgets(measured, budgets);
    // The load-bearing property of #778, asserted directly rather than inferred
    // from the absence of an OVER row: a warning must not turn a PR red.
    expect(failed).toBe(false);
    expect(rows.find((r) => r.route === '/')?.status).toBe('NEAR');
    expect(rows.find((r) => r.route === '/')?.headroom).toBe(0);
    expect(rows.find((r) => r.route === '/recipes')?.status).toBe('ok');
  });

  it('treats the band as exclusive at its boundary', () => {
    // 2.0 kB free is not NEAR; 1.9 kB is. Pinning both sides so the comparison
    // cannot silently flip between < and <=.
    const { rows } = evaluateBudgets(
      new Map([
        ['/', 223],
        ['/recipes', 253.1],
      ]),
      budgets,
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.route === '/')?.status).toBe('ok');
    expect(rows.find((r) => r.route === '/recipes')?.status).toBe('NEAR');
  });

  it('keeps OVER taking precedence over NEAR', () => {
    const { failed, rows } = evaluateBudgets(
      new Map([
        ['/', 226],
        ['/recipes', 254],
      ]),
      budgets,
    );
    expect(failed).toBe(true);
    expect(rows.find((r) => r.route === '/')?.status).toBe('OVER');
  });

  it('honours a caller-supplied band', () => {
    const { failed, rows } = evaluateBudgets(
      new Map([
        ['/', 215],
        ['/recipes', 255],
      ]),
      budgets,
      { nearKb: 20 },
    );
    expect(failed).toBe(false);
    expect(rows.every((r) => r.status === 'NEAR')).toBe(true);
    // Non-vacuity: `every` is true over zero rows (#751, #780).
    expect(rows).toHaveLength(2);
  });

  it('reproduces the zero-headroom state that motivated the issue', () => {
    // Real figures from CI run 31422094506, quoted in #778.
    const real = { '/': 225, '/recipes': 255, '/edit': 217 };
    const { failed, rows } = evaluateBudgets(
      new Map([
        ['/', 225],
        ['/recipes', 252],
        ['/edit', 217],
      ]),
      real,
    );
    expect(failed).toBe(false);
    expect(rows.filter((r) => r.status === 'NEAR').map((r) => r.route)).toEqual(['/', '/edit']);
  });
});

describe('evaluateBudgets (#206)', () => {
  const budgets = { '/': 135, '/recipes': 220 };

  it('passes when every tracked route is within budget', () => {
    const measured = new Map([
      ['/', 120],
      ['/recipes', 202],
    ]);
    const { failed, rows } = evaluateBudgets(measured, budgets);
    expect(failed).toBe(false);
    expect(rows.every((r) => r.status === 'ok')).toBe(true);
  });

  it('fails when a tracked route exceeds its budget', () => {
    const measured = new Map([
      ['/', 120],
      ['/recipes', 240],
    ]);
    const { failed, rows } = evaluateBudgets(measured, budgets);
    expect(failed).toBe(true);
    expect(rows.find((r) => r.route === '/recipes')?.status).toBe('OVER');
  });

  it('fails when a tracked route is missing from the build output', () => {
    const measured = new Map([['/', 120]]);
    const { failed, rows } = evaluateBudgets(measured, budgets);
    expect(failed).toBe(true);
    expect(rows.find((r) => r.route === '/recipes')?.status).toBe('MISSING');
  });
});

describe('evaluateBudgetChanges (issue #796)', () => {
  // The three routes that sat at exactly zero headroom when #796 was filed.
  const ZERO_HEADROOM_BASE = {
    '/': 225,
    '/recipes': 255,
    '/recipes/[cook]/[recipe]': 308,
    '/recipes/[cook]/[recipe]/edit': 218,
  };
  const ZERO_HEADROOM_MEASURED = new Map([
    ['/', 225],
    ['/recipes', 252],
    ['/recipes/[cook]/[recipe]', 308],
    ['/recipes/[cook]/[recipe]/edit', 218],
  ]);

  it('does not fail a change that inherits zero-headroom budgets untouched', () => {
    // The load-bearing property: the disease is failing a PR for a budget it
    // never chose. Same object on both sides = an unrelated PR.
    const { checked, subjects, violations } = evaluateBudgetChanges(
      ZERO_HEADROOM_MEASURED,
      { ...ZERO_HEADROOM_BASE },
      ZERO_HEADROOM_BASE,
    );
    expect(checked).toBe(true);
    expect(subjects).toEqual([]);
    expect(violations).toEqual([]);
  });

  it('fails a budget raised to exactly the measured value', () => {
    // Replays #789: /edit measured 218 and the budget was set to 218.
    const { violations } = evaluateBudgetChanges(
      ZERO_HEADROOM_MEASURED,
      { ...ZERO_HEADROOM_BASE, '/recipes/[cook]/[recipe]/edit': 218 },
      { ...ZERO_HEADROOM_BASE, '/recipes/[cook]/[recipe]/edit': 217 },
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      route: '/recipes/[cook]/[recipe]/edit',
      budget: 218,
      baseBudget: 217,
      actual: 218,
      headroom: 0,
      minimum: 220,
    });
  });

  it('accepts a raised budget that leaves the required margin', () => {
    const { subjects, violations } = evaluateBudgetChanges(
      ZERO_HEADROOM_MEASURED,
      { ...ZERO_HEADROOM_BASE, '/recipes/[cook]/[recipe]/edit': 220 },
      { ...ZERO_HEADROOM_BASE, '/recipes/[cook]/[recipe]/edit': 217 },
    );
    // Non-vacuity: the route really was examined and really was cleared.
    expect(subjects.map((s) => s.route)).toEqual(['/recipes/[cook]/[recipe]/edit']);
    expect(violations).toEqual([]);
  });

  it('treats the margin as inclusive at its boundary', () => {
    // Exactly REQUIRED_MARGIN_KB free passes; a tenth less does not. Pins both
    // sides so the comparison cannot silently flip between >= and >.
    const atBoundary = evaluateBudgetChanges(
      new Map([['/', 100 - REQUIRED_MARGIN_KB]]),
      { '/': 100 },
      { '/': 99 },
    );
    const justInside = evaluateBudgetChanges(
      new Map([['/', 100 - REQUIRED_MARGIN_KB + 0.1]]),
      { '/': 100 },
      { '/': 99 },
    );
    expect(atBoundary.violations).toEqual([]);
    expect(justInside.violations).toHaveLength(1);
  });

  it('requires margin on a brand-new budget key', () => {
    const { violations } = evaluateBudgetChanges(
      new Map([['/settings/photos', 190]]),
      { '/settings/photos': 190 },
      {},
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      route: '/settings/photos',
      baseBudget: undefined,
      minimum: 192,
    });
  });

  it('exempts a rename that carries an existing budget forward', () => {
    // #666 renamed /recipes/[id] -> /recipes/[cook]/[recipe] at unchanged
    // values that were already at zero headroom. That must stay green.
    const { subjects, violations } = evaluateBudgetChanges(
      new Map([
        ['/recipes/[cook]/[recipe]', 305],
        ['/recipes/[cook]/[recipe]/edit', 217],
      ]),
      { '/recipes/[cook]/[recipe]': 305, '/recipes/[cook]/[recipe]/edit': 217 },
      { '/recipes/[id]': 305, '/recipes/[id]/edit': 217 },
    );
    expect(subjects).toEqual([]);
    expect(violations).toEqual([]);
  });

  it('still requires margin on a rename that also raises the budget', () => {
    // A rename is only exempt because it carries the value forward. Changing
    // the number in the same commit is setting a budget, not inheriting one.
    const { violations } = evaluateBudgetChanges(
      new Map([['/recipes/[cook]/[recipe]', 306]]),
      { '/recipes/[cook]/[recipe]': 306 },
      { '/recipes/[id]': 305 },
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].route).toBe('/recipes/[cook]/[recipe]');
  });

  it('ignores a lowered budget', () => {
    const { subjects, violations } = evaluateBudgetChanges(
      new Map([['/', 224]]),
      { '/': 224 },
      { '/': 225 },
    );
    expect(subjects).toEqual([]);
    expect(violations).toEqual([]);
  });

  it('leaves an over-budget route to the primary gate', () => {
    // Already red for a clearer reason; a second differently-worded report on
    // the same route is noise.
    const { violations } = evaluateBudgetChanges(new Map([['/', 230]]), { '/': 226 }, { '/': 225 });
    expect(violations).toEqual([]);
  });

  it('skips rather than fails when the base cannot be resolved', () => {
    // A gate against spurious red must not become a new source of it.
    const { checked, violations } = evaluateBudgetChanges(
      ZERO_HEADROOM_MEASURED,
      { '/': 225 },
      null,
    );
    expect(checked).toBe(false);
    expect(violations).toEqual([]);
  });

  it('honours a caller-supplied margin', () => {
    const { violations } = evaluateBudgetChanges(
      new Map([['/', 218]]),
      { '/': 220 },
      { '/': 217 },
      { requiredMarginKb: 5 },
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].minimum).toBe(223);
  });

  it('keeps the required margin equal to the WARN band', () => {
    // Not a coincidence: a budget set with less margin than the NEAR band
    // would warn on the very run that introduces it.
    expect(REQUIRED_MARGIN_KB).toBe(2);
  });
});

describe('readBaseBudgetRoutes (issue #796)', () => {
  const budgetsJson = JSON.stringify({ routes: { '/': 225 } });
  const ok = { status: 0, stdout: budgetsJson };
  const fail = { status: 128, stdout: '' };

  /** Record git invocations and answer only the refs the fake "has". */
  function fakeGit(known) {
    const calls = [];
    const runGit = (args) => {
      calls.push(args.join(' '));
      if (args[0] === 'show') {
        return known.has(args[1].split(':')[0]) ? ok : fail;
      }
      if (args[0] === 'fetch') return known.has('FETCH') ? { status: 0 } : fail;
      return fail;
    };
    return { calls, runGit };
  }

  it('prefers the PR base ref over the default branch', () => {
    const { calls, runGit } = fakeGit(new Set(['origin/release', 'origin/main']));
    const { routes, ref } = readBaseBudgetRoutes({
      runGit,
      env: { GITHUB_BASE_REF: 'release' },
    });
    expect(routes).toEqual({ '/': 225 });
    expect(ref).toBe('origin/release');
    // origin/main resolves too, so only ordering can produce that answer.
    expect(calls).toEqual(['show origin/release:bundle-budgets.json']);
  });

  it('falls back to origin/main for a local run with no base ref', () => {
    const { runGit } = fakeGit(new Set(['origin/main']));
    const { routes, ref } = readBaseBudgetRoutes({ runGit, env: {} });
    expect(routes).toEqual({ '/': 225 });
    expect(ref).toBe('origin/main');
  });

  it('honours an explicit override ahead of everything else', () => {
    const { runGit } = fakeGit(new Set(['abc123', 'origin/main']));
    const { ref } = readBaseBudgetRoutes({
      runGit,
      env: { BUNDLE_BUDGET_BASE_REF: 'abc123', GITHUB_BASE_REF: 'main' },
    });
    expect(ref).toBe('abc123');
  });

  it('shallow-fetches the base branch on CI when no ref resolves', () => {
    const { calls, runGit } = fakeGit(new Set(['FETCH', 'FETCH_HEAD']));
    const { routes } = readBaseBudgetRoutes({
      runGit,
      env: { CI: 'true', GITHUB_BASE_REF: 'main' },
    });
    expect(routes).toEqual({ '/': 225 });
    expect(calls).toContain('fetch --no-tags --depth=1 origin main');
  });

  it('does not reach the network off CI', () => {
    const { calls, runGit } = fakeGit(new Set(['FETCH', 'FETCH_HEAD']));
    const { routes } = readBaseBudgetRoutes({ runGit, env: {} });
    expect(routes).toBeNull();
    expect(calls.some((c) => c.startsWith('fetch'))).toBe(false);
  });

  it('returns null instead of throwing on unparseable base content', () => {
    const runGit = (args) => (args[0] === 'show' ? { status: 0, stdout: '{ not json' } : fail);
    expect(readBaseBudgetRoutes({ runGit, env: {} }).routes).toBeNull();
  });

  it('returns null when the base file has no routes object', () => {
    const runGit = (args) =>
      args[0] === 'show' ? { status: 0, stdout: JSON.stringify({ '//': 'note only' }) } : fail;
    expect(readBaseBudgetRoutes({ runGit, env: {} }).routes).toBeNull();
  });
});
