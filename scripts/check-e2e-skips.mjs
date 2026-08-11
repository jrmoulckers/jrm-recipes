/**
 * E2E skip visibility gate for CI (issue #843).
 *
 * A skipped Playwright test is the quietest failure mode in the suite. It does
 * not fail, and unlike a vacuous assertion it does not even inflate a passing
 * count -- it leaves `4 skipped` beside a green check and no record of which
 * four. Several of this repo's skip conditions fire on a *missing UI element*
 * (`test.skip(true, 'Share control not rendered for this recipe.')`), which is
 * the exact condition the test exists to detect, so a control silently
 * disappearing looks identical to routine housekeeping.
 *
 * This reads the JSON reporter output and does two things a count in a summary
 * line cannot:
 *
 *   1. names every skipped test, on green runs as well as red, so the debt is
 *      visible without downloading an artifact; and
 *   2. fails when the skip set grows beyond the pinned baseline.
 *
 * The baseline pins a *count*, not a set of titles, and that is deliberate: the
 * four current skips are only observable in CI (a local run against a seeded
 * database skips none of them), so pinning titles guessed from a local run
 * would pin fiction. The count is measured, the titles are printed, and
 * tightening the pin to titles is a follow-up once CI has reported them.
 *
 * Usage:
 *   node scripts/check-e2e-skips.mjs [reportFile]
 *     defaults to playwright-report/results.json
 *
 * The pure helpers are exported and unit-tested in scripts/e2e-skips.test.mjs.
 * The CLI only runs when this file is executed directly.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The number of skips CI reports today, measured on two consecutive runs
 * (`main` at 20 tests and PR #841 at 23 tests both reported exactly 4). Lower
 * this as skips are fixed; raising it requires justifying why a test that used
 * to run no longer does.
 */
export const EXPECTED_SKIPS = 4;

/**
 * Flatten Playwright's JSON report into one row per test.
 *
 * The report nests `suites -> suites -> specs -> tests -> results`, and a spec
 * carries its file in `spec.file` while nested suites carry only titles, so the
 * walk threads the file down from wherever it was last seen.
 */
export function collectTests(report) {
  const rows = [];

  const walkSuite = (suite, file, titlePath) => {
    const nextFile = suite.file ?? file;
    // Playwright's root suite for a file carries `title === file`, so folding it
    // into the title path would render "spec.ts > spec.ts > test". The file is
    // reported separately, so drop the title when it merely repeats it.
    const isFileSuite = suite.title != null && suite.title === suite.file;
    const nextPath = suite.title && !isFileSuite ? [...titlePath, suite.title] : titlePath;

    for (const spec of suite.specs ?? []) {
      const specFile = spec.file ?? nextFile;
      for (const test of spec.tests ?? []) {
        rows.push({
          file: specFile ?? '<unknown>',
          title: [...nextPath, spec.title].filter(Boolean).join(' > '),
          status: test.status,
          // A test that skipped at runtime reports `skipped` on its final
          // result; `test.status === 'skipped'` covers the annotation form.
          annotations: (test.annotations ?? []).map((a) => a.description ?? a.type),
          results: (test.results ?? []).map((r) => r.status),
        });
      }
    }

    for (const child of suite.suites ?? []) walkSuite(child, nextFile, nextPath);
  };

  for (const suite of report.suites ?? []) walkSuite(suite, undefined, []);
  return rows;
}

/**
 * A test counts as skipped when Playwright's outcome says so. `status` on the
 * test object is the *expected* outcome, so the last result is what actually
 * happened -- a test that ran and then called `test.skip()` mid-body reports
 * `skipped` there while its declared status stays `expected`.
 */
export function isSkipped(row) {
  const last = row.results.at(-1);
  return last === 'skipped' || (row.results.length === 0 && row.status === 'skipped');
}

/** Partition the rows and compare the skip count against the baseline. */
export function evaluateSkips(rows, expected = EXPECTED_SKIPS) {
  const skipped = rows.filter(isSkipped);
  return {
    total: rows.length,
    skipped,
    expected,
    // Only growth fails. A run with *fewer* skips is the direction we want, and
    // failing on it would punish the fix.
    failed: skipped.length > expected,
  };
}

/** Human-readable lines, emitted on green runs too so the debt stays visible. */
export function formatReport(result) {
  const lines = [`E2E skip check (#843): ${result.skipped.length} skipped of ${result.total}`];

  for (const row of result.skipped) {
    const why = row.annotations.filter(Boolean).join('; ');
    lines.push(`  - ${row.file} > ${row.title}${why ? ` -- ${why}` : ''}`);
  }

  if (result.failed) {
    lines.push(
      `E2E skips rose to ${result.skipped.length}, above the pinned baseline of ${result.expected}.`,
      'A test that stopped running is not a passing test. Fix the skip, or justify',
      'the new baseline in the PR that raises it.',
    );
  } else if (result.skipped.length < result.expected) {
    lines.push(
      `Below the baseline of ${result.expected} -- lower EXPECTED_SKIPS in`,
      'scripts/check-e2e-skips.mjs to lock the improvement in.',
    );
  }

  return lines;
}

/**
 * Cross-check the walk against Playwright's own tally.
 *
 * `report.stats.skipped` is computed by the reporter, independently of how this
 * script walks the tree, so the two disagreeing means the walk is wrong -- a
 * silently mis-parsed report would otherwise report zero skips and pass. Two
 * signals from one artifact is the cheapest oracle available here.
 *
 * Returns `null` when the report carries no stats to compare against.
 */
export function crossCheck(report, skippedCount) {
  const reported = report?.stats?.skipped;
  if (typeof reported !== 'number') return null;
  return reported === skippedCount
    ? null
    : `E2E skip check: walked ${skippedCount} skipped but the reporter counted ${reported}. ` +
        'The report shape changed and this script is mis-parsing it.';
}

/* c8 ignore start -- CLI wiring, exercised in CI rather than in unit tests. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reportPath = resolve(repoRoot, process.argv[2] ?? 'playwright-report/results.json');

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    // A missing or unparseable report means the suite did not report, which is
    // not the same as reporting zero skips. Fail rather than pass vacuously.
    console.error(`E2E skip check: could not read ${reportPath}: ${error.message}`);
    process.exit(1);
  }

  const rows = collectTests(report);
  if (rows.length === 0) {
    console.error('E2E skip check: the report contained no tests, so nothing was measured.');
    process.exit(1);
  }

  const result = evaluateSkips(rows);

  const mismatch = crossCheck(report, result.skipped.length);
  if (mismatch) {
    console.error(mismatch);
    process.exit(1);
  }

  const lines = formatReport(result);
  for (const line of lines) console.log(line);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      ['### E2E skips (#843)', '', '```', ...lines, '```', ''].join('\n'),
    );
  }

  process.exit(result.failed ? 1 : 0);
}
/* c8 ignore stop */
