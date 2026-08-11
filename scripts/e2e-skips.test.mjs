import { describe, expect, it } from 'vitest';

import {
  EXPECTED_SKIPS,
  collectTests,
  crossCheck,
  evaluateSkips,
  formatReport,
  isSkipped,
} from './check-e2e-skips.mjs';

/**
 * A miniature Playwright JSON report, transcribed from a real one rather than
 * imagined: the root suite carries `title === file`, nested suites carry a
 * title and repeat the file, and a mid-body `test.skip()` leaves the test
 * `status: 'expected'` with a `skipped` result plus a `skip` annotation.
 *
 * The first draft of this fixture was reconstructed from memory and every unit
 * test passed against it while the script found zero tests in a real report.
 * Keep it faithful.
 */
function report() {
  return {
    stats: { expected: 1, skipped: 2, unexpected: 0, flaky: 0 },
    suites: [
      {
        title: 'share-print.spec.ts',
        file: 'share-print.spec.ts',
        specs: [
          {
            title: 'the Share menu exposes a Copy link action',
            file: 'share-print.spec.ts',
            tests: [
              {
                status: 'expected',
                annotations: [{ type: 'skip', description: 'Share control not rendered' }],
                results: [{ status: 'skipped' }],
              },
            ],
          },
        ],
        suites: [
          {
            title: 'nested describe',
            file: 'share-print.spec.ts',
            specs: [
              {
                title: 'a nested test that runs',
                file: 'share-print.spec.ts',
                tests: [{ status: 'expected', results: [{ status: 'passed' }] }],
              },
              {
                title: 'a nested test that skips',
                file: 'share-print.spec.ts',
                tests: [{ status: 'skipped', annotations: [], results: [{ status: 'skipped' }] }],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('collectTests', () => {
  it('flattens every test in the report', () => {
    const rows = collectTests(report());

    // Non-vacuity pin: every assertion below is satisfied by an empty array, so
    // without this a broken walk would look like a clean pass.
    expect(rows).toHaveLength(3);
  });

  it('threads the file down into nested suites', () => {
    const nested = collectTests(report()).find((row) =>
      row.title.includes('a nested test that runs'),
    );

    expect(nested?.file).toBe('share-print.spec.ts');
  });

  it('does not repeat the file name in the title', () => {
    // Playwright's root suite has `title === file`; folding it in would render
    // "share-print.spec.ts > share-print.spec.ts > ...".
    const titles = collectTests(report()).map((row) => row.title);

    expect(titles).toContain('nested describe > a nested test that runs');
  });

  it('keeps real describe titles', () => {
    const titles = collectTests(report()).map((row) => row.title);

    expect(titles).toContain('the Share menu exposes a Copy link action');
  });

  it('returns nothing for a report with no suites', () => {
    expect(collectTests({})).toHaveLength(0);
  });
});

describe('isSkipped', () => {
  it('reads the outcome from the last result, not the declared status', () => {
    // The real shape of a mid-body `test.skip()`: Playwright still declares the
    // test 'expected', and only the result says it did not run. Trusting
    // `status` alone would miss every runtime skip in this repo.
    expect(isSkipped({ status: 'expected', results: ['skipped'] })).toBe(true);
  });

  it('does not count a passing test', () => {
    expect(isSkipped({ status: 'expected', results: ['passed'] })).toBe(false);
  });

  it('counts a test declared skipped that never produced a result', () => {
    expect(isSkipped({ status: 'skipped', results: [] })).toBe(true);
  });

  it('uses the final result when a test was retried', () => {
    expect(isSkipped({ status: 'expected', results: ['failed', 'passed'] })).toBe(false);
  });
});

describe('crossCheck', () => {
  it('agrees with the reporter when the walk is correct', () => {
    const rows = collectTests(report());
    const skipped = rows.filter(isSkipped).length;

    expect(skipped).toBe(2); // pins the premise of the check below
    expect(crossCheck(report(), skipped)).toBeNull();
  });

  it('reports a mismatch when the walk undercounts', () => {
    // The failure a mis-parsed report produces: zero skips, which would
    // otherwise sail past the baseline as an improvement.
    expect(crossCheck(report(), 0)).toContain('mis-parsing');
  });

  it('says nothing when the report carries no stats', () => {
    expect(crossCheck({ suites: [] }, 3)).toBeNull();
  });
});

describe('evaluateSkips', () => {
  const rows = [
    { status: 'expected', results: ['skipped'], annotations: [], file: 'a', title: 'a' },
    { status: 'expected', results: ['skipped'], annotations: [], file: 'b', title: 'b' },
    { status: 'expected', results: ['passed'], annotations: [], file: 'c', title: 'c' },
  ];

  it('passes when the skip count matches the baseline', () => {
    expect(evaluateSkips(rows, 2).failed).toBe(false);
  });

  it('fails when skips grow beyond the baseline', () => {
    expect(evaluateSkips(rows, 1).failed).toBe(true);
  });

  it('passes when skips fall below the baseline', () => {
    // Fewer skips is the direction the baseline exists to encourage, so failing
    // on it would punish the fix.
    expect(evaluateSkips(rows, 3).failed).toBe(false);
  });

  it('reports the total alongside the skips', () => {
    const result = evaluateSkips(rows, 2);

    expect(result.total).toBe(3);
    expect(result.skipped).toHaveLength(2);
  });
});

describe('formatReport', () => {
  it('names every skipped test, including its reason', () => {
    const result = evaluateSkips(collectTests(report()), EXPECTED_SKIPS);
    const text = formatReport(result).join('\n');

    expect(text).toContain('the Share menu exposes a Copy link action');
    expect(text).toContain('Share control not rendered');
  });

  it('does not name a test that ran', () => {
    const result = evaluateSkips(collectTests(report()), EXPECTED_SKIPS);

    expect(formatReport(result).join('\n')).not.toContain('a nested test that runs');
  });

  it('explains the failure when the baseline is exceeded', () => {
    const result = evaluateSkips(collectTests(report()), 0);

    expect(formatReport(result).join('\n')).toContain('above the pinned baseline');
  });

  it('invites lowering the baseline when skips fall', () => {
    const result = evaluateSkips(collectTests(report()), 5);

    expect(formatReport(result).join('\n')).toContain('lower EXPECTED_SKIPS');
  });
});
