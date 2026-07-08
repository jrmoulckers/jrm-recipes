/**
 * First-load JS budget gate for CI (issue #206).
 *
 * Parses the route table that `next build` prints and fails when the reported
 * "First Load JS" for a tracked route exceeds the budget in bundle-budgets.json.
 * This guards against silent regressions — e.g. a new static import of a heavy
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
 * unit-tested in scripts/bundle-budget.test.mjs; the CLI only runs when this
 * file is executed directly.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
 * on a route row is its First Load JS; ANSI colour codes are stripped first so
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
 * Compare measured first-load sizes against the per-route budgets. Returns the
 * rows to print and whether the gate failed (over budget or a tracked route was
 * not found in the build output).
 */
export function evaluateBudgets(measured, budgets) {
  const rows = [];
  let failed = false;
  for (const [route, budget] of Object.entries(budgets)) {
    const actual = measured.get(route);
    if (actual === undefined) {
      rows.push({ route, actual: undefined, budget, status: "MISSING" });
      failed = true;
      continue;
    }
    const ok = actual <= budget;
    if (!ok) failed = true;
    rows.push({ route, actual, budget, status: ok ? "ok" : "OVER" });
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
      NEXT_PUBLIC_DEV_AUTH_BYPASS: process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS ?? "1",
    },
  });
  const output = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
  console.log(output);
  if (res.status !== 0) {
    console.error("`next build` failed; cannot check bundle budget.");
    process.exit(res.status ?? 1);
  }
  return output;
}

function main() {
  const budgets = JSON.parse(
    readFileSync(resolve(repoRoot, "bundle-budgets.json"), "utf8"),
  ).routes;

  const measured = parseFirstLoadJs(getBuildOutput());
  const { rows, failed } = evaluateBudgets(measured, budgets);

  console.log("\nFirst-load JS budget check (#206)");
  console.log("─".repeat(64));
  for (const r of rows) {
    const flag = r.status === "ok" ? "✓" : "✗";
    const actual = r.actual === undefined ? "—" : `${r.actual.toFixed(1)} kB`;
    const budgetLabel = `${r.budget} kB`;
    console.log(
      `${flag} ${r.route.padEnd(28)} ${actual.padStart(10)} / ${budgetLabel.padStart(
        7,
      )}  ${r.status}`,
    );
  }
  console.log("─".repeat(64));

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
