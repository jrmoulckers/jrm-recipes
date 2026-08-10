/**
 * First-load JS budget gate for CI (issue #206).
 *
 * Parses the route table that `next build` prints and fails when the reported
 * "First Load JS" for a tracked route exceeds the budget in bundle-budgets.json.
 * This guards against silent regressions, e.g. a new static import of a heavy
 * client component landing in a route's initial payload.
 *
 * Usage:
 *   node scripts/check-bundle-budget.mjs [buildLogFile]
 *     - with a log file: parse an existing `next build` output (CI reuses the
 *       build step's captured log, so the app is only built once).
 *     - without arguments: run `next build` here and parse its output (handy
 *       locally via `pnpm check:bundle`).
 *
 * The pure helpers (parseFirstLoadJs, evaluateBudgets, toKb) are exported and
 * unit-tested in scripts/bundle-budget.test.mjs. The CLI only runs when this
 * file is executed directly.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Convert a size token from the build table to kB. */
export function toKb(value, unit) {
  if (unit === "B") return value / 1024;
  if (unit === "MB") return value * 1024;
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
    const line = raw.replace(/\u001b\[[0-9;]*m/g, "");
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
 * `next build` prints First Load JS as whole kB at this magnitude, so a route
 * with less than a kilobyte of margin can be tipped over by a sub-kB change —
 * including one that adds no code, when webpack redistributes shared modules.
 * Linux CI also reads ~1 kB above a local Windows build. Two kilobytes covers
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
        status: "MISSING",
      });
      failed = true;
      continue;
    }
    const headroom = budget - actual;
    const ok = actual <= budget;
    if (!ok) failed = true;
    const status = !ok ? "OVER" : headroom < nearKb ? "NEAR" : "ok";
    rows.push({ route, actual, budget, headroom, status });
  }
  return { rows, failed };
}

function getBuildOutput() {
  const logArg = process.argv[2];
  if (logArg) {
    console.log(`Reading build output from ${logArg}`);
    return readFileSync(resolve(process.cwd(), logArg), "utf8");
  }
  console.log("Running `next build` to measure first-load JS...");
  const res = spawnSync("next build", {
    cwd: repoRoot,
    encoding: "utf8",
    shell: true,
    env: {
      ...process.env,
      SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION ?? "1",
      NEXT_PUBLIC_APP_URL:
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      NEXT_PUBLIC_DEV_AUTH_BYPASS:
        process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS ?? "1",
    },
  });
  const output = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
  console.log(output);
  if (res.status !== 0) {
    console.error("`next build` failed. Cannot check bundle budget.");
    process.exit(res.status ?? 1);
  }
  return output;
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
    "",
    "| Route | First Load JS | Budget | Headroom |",
    "| --- | ---: | ---: | ---: |",
    ...near.map(
      (r) =>
        `| \`${r.route}\` | ${r.actual.toFixed(1)} kB | ${r.budget} kB | ${r.headroom.toFixed(1)} kB |`,
    ),
    "",
    "Advisory, not a failure. A route this close can be turned red by an unrelated PR — see #778.",
    "",
  ];
  try {
    appendFileSync(path, `${lines.join("\n")}\n`);
  } catch (err) {
    console.warn(`Could not write job summary: ${err.message}`);
  }
}

function main() {
  const budgets = JSON.parse(
    readFileSync(resolve(repoRoot, "bundle-budgets.json"), "utf8"),
  ).routes;

  const measured = parseFirstLoadJs(getBuildOutput());
  const { rows, failed } = evaluateBudgets(measured, budgets);

  console.log("\nFirst-load JS budget check (#206)");
  console.log("─".repeat(72));
  for (const r of rows) {
    const flag = { ok: "✓", NEAR: "⚠", OVER: "✗", MISSING: "✗" }[r.status];
    const actual = r.actual === undefined ? "n/a" : `${r.actual.toFixed(1)} kB`;
    const budgetLabel = `${r.budget} kB`;
    const headroom =
      r.headroom === undefined ? "" : `${r.headroom.toFixed(1)} kB free`;
    console.log(
      `${flag} ${r.route.padEnd(28)} ${actual.padStart(10)} / ${budgetLabel.padStart(
        7,
      )}  ${r.status.padEnd(7)} ${headroom}`,
    );
  }
  console.log("─".repeat(72));

  const near = rows.filter((r) => r.status === "NEAR");
  if (near.length > 0) {
    // Advisory only — deliberately printed before the failure branch so it is
    // visible on red runs too, and deliberately does not touch the exit code.
    console.warn(
      `\n⚠ ${near.length} route(s) within ${NEAR_KB} kB of budget: ` +
        `${near.map((r) => r.route).join(", ")}.\n` +
        "  This is a warning, not a failure. A route this close can be tipped " +
        "red by an\n  unrelated PR, because `next build` reports whole kB and " +
        "Linux CI reads ~1 kB\n  above a local Windows build. When that happens " +
        "the red route is usually not\n  the cause — measure which modules " +
        "entered the route before bumping (#778).",
    );
    writeStepSummary(near);
  }

  if (failed) {
    console.error(
      "\nBundle budget exceeded (or a tracked route was not found). Reduce " +
        "first-load JS, or bump the budget in bundle-budgets.json with justification.",
    );
    process.exit(1);
  }
  console.log("\nAll tracked routes are within budget.");
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
