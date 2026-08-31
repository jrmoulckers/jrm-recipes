/**
 * First-load JS budget gate for CI (issue #206).
 *
 * Builds a Webpack entrypoint manifest and fails when the gzipped first-load JS
 * for a tracked route exceeds the budget in bundle-budgets.json.
 * This guards against silent regressions, e.g. a new static import of a heavy
 * client component landing in a route's initial payload.
 *
 * Usage:
 *   node scripts/check-bundle-budget.mjs [buildLogFile]
 *     - with a log file: reuse an existing build and its generated manifest,
 *       falling back to the legacy route-table parser when needed.
 *     - without arguments: run `next build` here and measure its manifest (handy
 *       locally via `pnpm check:bundle`).
 *
 * The pure helpers are exported and unit-tested in scripts/bundle-budget.test.mjs.
 * The CLI only runs when this file is executed directly.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { measureRouteBundles } from './bundle-budget-manifest.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Convert a size token from the build table to kB. */
export function toKb(value, unit) {
  if (unit === 'B') return value / 1024;
  if (unit === 'MB') return value * 1024;
  return value; // kB
}

/**
 * Extract `route -> firstLoadKb` from `next build` output. The last size column
 * on a route row is its First Load JS, and ANSI colour codes are stripped first so
 * the parse works with or without a TTY.
 */
export function parseFirstLoadJs(output) {
  const routes = new Map();
  const sizeRe = /([\d.]+)\s*(B|kB|MB)\b/g;
  for (const raw of output.split(/\r?\n/)) {
    // Strips ANSI colour codes from `next build` output. The escape character
    // is the thing being matched, so `no-control-regex` has nothing to warn
    // about here.
    // eslint-disable-next-line no-control-regex
    const line = raw.replace(/\u001b\[[0-9;]*m/g, '');
    if (!/^\s*[┌├└]/u.test(line)) continue; // route rows only
    const routeMatch = line.match(/\s(\/[^\s]*)\s/u); // path token
    if (!routeMatch) continue;
    const sizes = [...line.matchAll(sizeRe)];
    if (sizes.length === 0) continue;
    const last = sizes[sizes.length - 1];
    routes.set(routeMatch[1], toKb(parseFloat(last[1]), last[2]));
  }
  return routes;
}

/**
 * Headroom below which a passing route is reported as NEAR (issue #778).
 *
 * The gate records First Load JS as whole kB, so a route
 * with less than a kilobyte of margin can be tipped over by a sub-kB change —
 * including one that adds no code, when webpack redistributes shared modules.
 * Linux CI and local Windows builds can differ by ~1 kB. Two kilobytes covers
 * both effects, so NEAR fires before the surprise rather than after it.
 */
export const NEAR_KB = 2;

/**
 * Compare measured first-load sizes against the per-route budgets. Returns the
 * rows to print and whether the gate failed (over budget or a tracked route was
 * not found in the build output).
 *
 * NEAR is advisory and MUST NOT affect `failed`: the point of #778 is to make
 * budget pressure visible *before* it turns a PR red, not to add a second way
 * for an unrelated PR to fail. Three of the four tracked routes sat at exactly
 * zero headroom when this was written, and three separate incidents had already
 * produced a wrong-but-durable diagnosis written into bundle-budgets.json.
 */
export function evaluateBudgets(measured, budgets, { nearKb = NEAR_KB } = {}) {
  const rows = [];
  let failed = false;
  for (const [route, budget] of Object.entries(budgets)) {
    const actual = measured.get(route);
    if (actual === undefined) {
      rows.push({
        route,
        actual: undefined,
        budget,
        headroom: undefined,
        status: 'MISSING',
      });
      failed = true;
      continue;
    }
    const headroom = budget - actual;
    const ok = actual <= budget;
    if (!ok) failed = true;
    const status = !ok ? 'OVER' : headroom < nearKb ? 'NEAR' : 'ok';
    rows.push({ route, actual, budget, headroom, status });
  }
  return { rows, failed };
}

/**
 * Margin a *newly set or raised* budget must leave above its measured value
 * (issue #796).
 *
 * Deliberately equal to NEAR_KB rather than coincidentally so: a budget set
 * with less margin than the warning band would be born NEAR, i.e. the very run
 * that introduces it would already warn that it is about to go red. Requiring
 * exactly NEAR_KB makes the two rules coherent — a budget that passes this
 * check is precisely one the WARN band will stay quiet about.
 *
 * Absolute rather than proportional, because both effects it covers are
 * absolute: the gate records whole kB, and platforms can differ by ~1 kB.
 */
export const REQUIRED_MARGIN_KB = NEAR_KB;

/**
 * Largest accepted difference between a displayed whole-kB measurement and a
 * recorded claim. Issue #1055 measured the same route and application code
 * alternating by exactly 1 kB. Anything wider would hide a real regression.
 */
export const MAX_MEASUREMENT_TOLERANCE_KB = 1;

/**
 * Enforce headroom on budgets this change actually sets — proposal (2) of #778.
 *
 * The distinction this function exists to draw:
 *
 *   - failing a change that *raises* a budget to zero headroom is correct, because
 *     that change is choosing the number;
 *   - failing a change that merely *inherits* an existing zero-headroom budget it
 *     never touched is the disease itself (#778). Three tracked routes sit at
 *     exactly zero headroom today and MUST NOT begin failing.
 *
 * So the subject set is derived from a diff against the base ref's budgets, not
 * from the absolute headroom of every route. A route is subject when its budget
 * is new or strictly larger than at base. Lowering a budget is never subject.
 *
 * Renames carry a budget forward rather than setting one, so a new key whose
 * value matches a budget removed in the same change is exempt (#666 renamed
 * /recipes/[id] -> /recipes/[cook]/[recipe] at unchanged, already-zero-headroom
 * values; that must stay green).
 *
 * A route already OVER its budget is left alone here: it is failing for the
 * primary reason and does not need a second, differently-worded report.
 *
 * `baseBudgets` of null means the base could not be resolved; the requirement is
 * skipped rather than enforced, because a gate against spurious red must not
 * become a new source of it.
 */
export function evaluateBudgetChanges(
  measured,
  budgets,
  baseBudgets,
  { requiredMarginKb = REQUIRED_MARGIN_KB } = {},
) {
  if (!baseBudgets) return { checked: false, subjects: [], violations: [] };

  const carriedForward = new Set(
    Object.entries(baseBudgets)
      .filter(([route]) => !(route in budgets))
      .map(([, budget]) => budget),
  );

  const subjects = [];
  for (const [route, budget] of Object.entries(budgets)) {
    const baseBudget = baseBudgets[route];
    if (baseBudget === undefined) {
      if (carriedForward.has(budget)) continue; // renamed key, same budget
      subjects.push({ route, budget, baseBudget: undefined });
      continue;
    }
    if (budget > baseBudget) subjects.push({ route, budget, baseBudget });
  }

  const violations = [];
  for (const subject of subjects) {
    const actual = measured.get(subject.route);
    if (actual === undefined || actual > subject.budget) continue;
    const headroom = subject.budget - actual;
    if (headroom >= requiredMarginKb) continue;
    violations.push({
      ...subject,
      actual,
      headroom,
      minimum: Math.ceil(actual + requiredMarginKb),
    });
  }

  return { checked: true, subjects, violations };
}

/**
 * Read `routes` from the base ref's bundle-budgets.json so evaluateBudgetChanges
 * can tell a raised budget from an inherited one.
 *
 * This makes the check behave differently on a PR than on a local run, and that
 * is deliberate: only a diff can distinguish "you set this number" from "you
 * inherited it". On a PR, GITHUB_BASE_REF names the target branch. Locally, a
 * normal clone already has origin/<default>, so the check works the same way
 * against uncommitted edits. On a push to main the base resolves to main itself,
 * nothing reads as raised, and the requirement is effectively a no-op — this is
 * a pre-merge check by design.
 *
 * When no candidate resolves the requirement is SKIPPED, never failed. A shallow
 * checkout, a detached run, or an offline machine must not turn a PR red.
 *
 * `runGit` is injected so this is unit-testable without a repository.
 */
export function readBaseBudgetRoutes({ runGit = defaultRunGit, env = process.env } = {}) {
  const show = (ref) => {
    const res = runGit(['show', `${ref}:bundle-budgets.json`]);
    if (res.status !== 0 || !res.stdout) return null;
    try {
      const routes = JSON.parse(res.stdout).routes;
      return routes && typeof routes === 'object' ? routes : null;
    } catch {
      return null;
    }
  };

  const branch = env.GITHUB_BASE_REF || 'main';
  const candidates = [
    env.BUNDLE_BUDGET_BASE_REF,
    env.GITHUB_BASE_REF && `origin/${env.GITHUB_BASE_REF}`,
    'origin/main',
  ].filter(Boolean);

  for (const ref of candidates) {
    const routes = show(ref);
    if (routes) return { routes, ref };
  }

  // CI checks out at depth 1, so origin/<base> often does not exist locally.
  // One shallow fetch of the base branch is enough, and the repository is
  // public, so the credential-free CI checkout can still read it.
  if (env.CI) {
    const fetched = runGit(['fetch', '--no-tags', '--depth=1', 'origin', branch]);
    if (fetched.status === 0) {
      const routes = show('FETCH_HEAD');
      if (routes) return { routes, ref: `origin/${branch}` };
    }
  }

  return { routes: null, ref: null };
}

function defaultRunGit(args) {
  return spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

/**
 * Map a Node `process.platform` value, or a value written in a claim, onto the
 * names used in bundle-budgets.json. Claims are authored by humans, so both
 * `windows` and Node's `win32` have to mean the same thing.
 */
export function normalizePlatform(value) {
  if (!value) return null;
  const v = String(value).toLowerCase();
  if (v === 'win32' || v === 'windows') return 'windows';
  if (v === 'darwin' || v === 'macos') return 'macos';
  return v;
}

/**
 * Verify the recorded measurement claims in bundle-budgets.json against the
 * build this run just measured (issue #858).
 *
 * The budget gate compares a measurement to a *budget* and never reads the
 * notes, so a number written into the file as justification is checked by
 * nobody. Four such claims have now been corrected — #674/#690, #763, #820 and
 * #857 — each after it had already misled a reader, and one of them (a stale
 * "307" for a route that measures 308) was a single digit away from licensing a
 * red gate on main. Every existing guard misses this by construction: NEAR
 * cannot fail, and the #796 headroom rule only governs budgets that are new or
 * raised.
 *
 * Rules, each of which is a constraint this repo learned the hard way:
 *
 * - A claim is only meaningful about the platform that produced it. Linux CI
 *   and local Windows builds can differ by about 1 kB, so an unqualified number is
 *   not checkable at all. Claims for other platforms SKIP — that is #796's
 *   precedent, since a guard against spurious red must not become one.
 * - A claim with no `platform` FAILS everywhere rather than skipping. That is a
 *   malformed entry in a tracked file, not a limit of the current environment,
 *   and silently skipping it would recreate exactly the hole this closes.
 * - A matching claim whose route is absent from the build FAILS: the route was
 *   renamed or removed and the claim now describes nothing.
 *
 * Comparison is on whole kB because that is the manifest measurement contract
 * and what every number in the file is quoted in.
 */
export function evaluateMeasurementClaims(measured, claims, { platform = process.platform } = {}) {
  const here = normalizePlatform(platform);
  const rows = [];
  let failed = false;

  for (const claim of claims ?? []) {
    const route = claim?.route;
    const toleranceKb = claim?.toleranceKb ?? 0;
    const base = {
      route,
      claimed: claim?.kb,
      toleranceKb,
      runId: claim?.runId,
      issue: claim?.issue,
    };

    if (!claim?.platform) {
      rows.push({ ...base, status: 'INVALID' });
      failed = true;
      continue;
    }
    if (!Number.isInteger(claim?.kb) || claim.kb < 0) {
      rows.push({ ...base, status: 'INVALID_CLAIM' });
      failed = true;
      continue;
    }
    if (
      !Number.isInteger(toleranceKb) ||
      toleranceKb < 0 ||
      toleranceKb > MAX_MEASUREMENT_TOLERANCE_KB
    ) {
      rows.push({ ...base, status: 'INVALID_TOLERANCE' });
      failed = true;
      continue;
    }
    if (normalizePlatform(claim.platform) !== here) {
      rows.push({ ...base, status: 'SKIP', platform: normalizePlatform(claim.platform) });
      continue;
    }

    const actual = measured.get(route);
    if (actual === undefined) {
      rows.push({ ...base, status: 'MISSING' });
      failed = true;
      continue;
    }

    const rounded = Math.round(actual);
    const difference = Math.abs(rounded - claim.kb);
    if (difference > toleranceKb) {
      rows.push({ ...base, status: 'STALE', actual: rounded });
      failed = true;
      continue;
    }
    rows.push({
      ...base,
      status: difference === 0 ? 'ok' : 'TOLERATED',
      actual: rounded,
      difference,
    });
  }

  return { rows, failed };
}

function getBuildOutput() {
  const logArg = process.argv[2];
  if (logArg) {
    console.log(`Reading build output from ${logArg}`);
    return readFileSync(resolve(process.cwd(), logArg), 'utf8');
  }
  console.log('Running `next build` to measure first-load JS...');
  const res = spawnSync('next build --webpack', {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION ?? '1',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      NEXT_PUBLIC_DEV_AUTH_BYPASS: process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS ?? '1',
    },
  });
  const output = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
  console.log(output);
  if (res.status !== 0) {
    console.error('`next build` failed. Cannot check bundle budget.');
    process.exit(res.status ?? 1);
  }
  return output;
}

export function readBundleMeasurements(buildDir = resolve(repoRoot, '.next')) {
  const manifest = JSON.parse(
    readFileSync(resolve(buildDir, 'bundle-budget-manifest.json'), 'utf8'),
  );
  return measureRouteBundles(manifest, (chunk) => readFileSync(resolve(buildDir, chunk)));
}

/**
 * Surface NEAR routes in the GitHub Actions job summary, so budget pressure is
 * visible on a green run without anyone opening the build log. No-ops locally,
 * and never throws: a warning must not be able to fail the gate it warns about.
 */
function writeStepSummary(near) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  const lines = [
    `### ⚠ Bundle budget: ${near.length} route(s) within ${NEAR_KB} kB`,
    '',
    '| Route | First Load JS | Budget | Headroom |',
    '| --- | ---: | ---: | ---: |',
    ...near.map(
      (r) =>
        `| \`${r.route}\` | ${r.actual.toFixed(1)} kB | ${r.budget} kB | ${r.headroom.toFixed(1)} kB |`,
    ),
    '',
    'Advisory, not a failure. A route this close can be turned red by an unrelated PR — see #778.',
    '',
  ];
  try {
    appendFileSync(path, `${lines.join('\n')}\n`);
  } catch (err) {
    console.warn(`Could not write job summary: ${err.message}`);
  }
}

function main() {
  const budgetFile = JSON.parse(readFileSync(resolve(repoRoot, 'bundle-budgets.json'), 'utf8'));
  const budgets = budgetFile.routes;

  const buildOutput = getBuildOutput();
  let measured;
  try {
    measured = readBundleMeasurements();
  } catch (error) {
    console.warn(
      `Could not read bundle-budget-manifest.json (${error.message}); ` +
        'falling back to the legacy build-output parser.',
    );
    measured = parseFirstLoadJs(buildOutput);
  }
  const { rows, failed } = evaluateBudgets(measured, budgets);

  console.log('\nFirst-load JS budget check (#206)');
  console.log('─'.repeat(72));
  for (const r of rows) {
    const flag = { ok: '✓', NEAR: '⚠', OVER: '✗', MISSING: '✗' }[r.status];
    const actual = r.actual === undefined ? 'n/a' : `${r.actual.toFixed(1)} kB`;
    const budgetLabel = `${r.budget} kB`;
    const headroom = r.headroom === undefined ? '' : `${r.headroom.toFixed(1)} kB free`;
    console.log(
      `${flag} ${r.route.padEnd(28)} ${actual.padStart(10)} / ${budgetLabel.padStart(
        7,
      )}  ${r.status.padEnd(7)} ${headroom}`,
    );
  }
  console.log('─'.repeat(72));

  const near = rows.filter((r) => r.status === 'NEAR');
  if (near.length > 0) {
    // Advisory only — deliberately printed before the failure branch so it is
    // visible on red runs too, and deliberately does not touch the exit code.
    console.warn(
      `\n⚠ ${near.length} route(s) within ${NEAR_KB} kB of budget: ` +
        `${near.map((r) => r.route).join(', ')}.\n` +
        '  This is a warning, not a failure. A route this close can be tipped ' +
        'red by an\n  unrelated PR, because the gate records whole kB and ' +
        'Linux CI and local Windows builds can differ by ~1 kB. When that happens ' +
        'the red route is usually not\n  the cause — measure which modules ' +
        'entered the route before bumping (#778).',
    );
    writeStepSummary(near);
  }

  const base = readBaseBudgetRoutes();
  const { checked, subjects, violations } = evaluateBudgetChanges(measured, budgets, base.routes);
  if (!checked) {
    console.log(
      '\nℹ Skipping the raised-budget headroom check (#796): could not read ' +
        'bundle-budgets.json\n  from the base ref. This is a skip, not a ' +
        'failure.',
    );
  } else if (violations.length > 0) {
    console.error(
      `\n✗ ${violations.length} budget(s) raised without the required ` +
        `${REQUIRED_MARGIN_KB} kB of headroom (#796), against ${base.ref}:`,
    );
    for (const v of violations) {
      const from = v.baseBudget === undefined ? 'new' : `was ${v.baseBudget} kB`;
      console.error(
        `    ${v.route}: set to ${v.budget} kB (${from}) but measures ` +
          `${v.actual.toFixed(1)} kB — only ${v.headroom.toFixed(1)} kB free. ` +
          `Use at least ${v.minimum} kB.`,
      );
    }
    console.error(
      '  A budget set to exactly what it measures goes red on the next ' +
        'unrelated PR, which\n  is how every zero-headroom route here was ' +
        'created (#778). Size the margin from CI\n  figures: Linux CI and local ' +
        'Windows builds can differ by ~1 kB, and the gate records\n  whole kB, so a ' +
        'sub-kB webpack redistribution can move a route a full kB.',
    );
  } else if (subjects.length > 0) {
    // Only on a budget-changing run: confirm the margin was actually checked,
    // so a bumper can see the number they chose was measured against CI figures.
    console.log(
      `\n✓ ${subjects.length} budget(s) set or raised vs ${base.ref}, each with ` +
        `at least ${REQUIRED_MARGIN_KB} kB of headroom (#796).`,
    );
  }

  const claims = evaluateMeasurementClaims(measured, budgetFile['//measured']?.claims);
  const stale = claims.rows.filter(
    (r) => r.status !== 'ok' && r.status !== 'TOLERATED' && r.status !== 'SKIP',
  );
  const skipped = claims.rows.filter((r) => r.status === 'SKIP');
  const tolerated = claims.rows.filter((r) => r.status === 'TOLERATED');
  if (claims.rows.length > 0) {
    if (stale.length === 0) {
      const verified = claims.rows.length - skipped.length;
      if (verified === 0) {
        console.log(
          `\nℹ ${skipped.length} recorded measurement claim(s) skipped (#858): all ` +
            'were measured on\n  another platform. Linux CI and local Windows ' +
            'builds can differ by ~1 kB, so they are\n  checked on CI, not here. This is ' +
            'a skip, not a failure.',
        );
      } else {
        console.log(
          `\n✓ ${verified} recorded measurement claim(s) still match this build (#858)` +
            (tolerated.length > 0
              ? `; ${tolerated.length} within the measured ±${MAX_MEASUREMENT_TOLERANCE_KB} kB display noise`
              : '') +
            (skipped.length > 0
              ? `; ${skipped.length} skipped as measured on another platform.`
              : '.'),
        );
      }
    } else {
      console.error(`\n✗ ${stale.length} recorded measurement claim(s) no longer match (#858):`);
      for (const r of stale) {
        if (r.status === 'INVALID') {
          console.error(
            `    ${r.route ?? '(no route)'}: claim has no "platform". A number ` +
              'without the platform that produced it is not checkable — Linux ' +
              'CI and local Windows builds can differ by ~1 kB.',
          );
        } else if (r.status === 'INVALID_CLAIM') {
          console.error(
            `    ${r.route ?? '(no route)'}: claim "kb" must be a non-negative whole number.`,
          );
        } else if (r.status === 'INVALID_TOLERANCE') {
          console.error(
            `    ${r.route ?? '(no route)'}: claim tolerance must be a whole number from 0 to ` +
              `${MAX_MEASUREMENT_TOLERANCE_KB} kB. Wider tolerances hide real regressions.`,
          );
        } else if (r.status === 'MISSING') {
          console.error(
            `    ${r.route}: claimed ${r.claimed} kB but the route is not in ` +
              'this build. It was renamed or removed, so the claim now ' +
              'describes nothing.',
          );
        } else {
          const prov = r.runId ? ` recorded from run ${r.runId}` : '';
          const iss = r.issue ? ` (#${r.issue})` : '';
          console.error(
            `    ${r.route}: claims ${r.claimed} kB${prov}${iss}, but this run ` +
              `measures ${r.actual} kB.`,
          );
        }
      }
      console.error(
        '  Update the claim to the value this run measured, and record the run ' +
          'that produced\n  it. These numbers are quoted as justification in ' +
          'bundle-budgets.json, so a stale one\n  is read as authoritative: a ' +
          'stale "307" for a route that measures 308 was one digit\n  from ' +
          'licensing a red gate on main (#819, #820).',
      );
    }
  }

  if (failed) {
    console.error(
      '\nBundle budget exceeded (or a tracked route was not found). Reduce ' +
        'first-load JS, or bump the budget in bundle-budgets.json with justification.',
    );
    process.exit(1);
  }
  if (violations.length > 0) process.exit(1);
  if (claims.failed) process.exit(1);
  console.log('\nAll tracked routes are within budget.');
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
