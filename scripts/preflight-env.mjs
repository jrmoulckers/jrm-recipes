// @ts-check
/**
 * Production deploy preflight (#256).
 *
 * Runs at the very start of `vercel-build`, before migrations and `next build`,
 * and fails the deploy fast with an actionable message when a *production*
 * environment is missing configuration it genuinely needs at runtime.
 *
 * Why: every var in `src/env.js` is optional so the app boots with zero config
 * (great for local/CI/preview). That same leniency means a production deploy
 * with no `DATABASE_URL` or a missing `NEXT_PUBLIC_APP_URL` builds green and
 * silently ships an app with no database or wrong share/PWA URLs. This asserts
 * the production-only requirements up front instead.
 *
 * Scope: only acts when `VERCEL_ENV=production`. Local, CI, and preview
 * (zero-config) runs are untouched and always pass. It complements — never
 * duplicates — the fail-closed auth guard in `src/env.js`; that guard rejects
 * dev-bypass in production, this checks config *completeness*.
 */

const isProduction = process.env.VERCEL_ENV === "production";

if (!isProduction) {
  console.log(
    "[preflight] Non-production environment — skipping production env checks.",
  );
  process.exit(0);
}

/** @type {string[]} */
const problems = [];

/**
 * Require a var to be a non-empty, parseable URL.
 *
 * @param {string} name
 * @param {string[]} [protocols] allowed URL protocols (e.g. ["http:","https:"])
 */
function requireUrl(name, protocols) {
  const value = process.env[name];
  if (!value) {
    problems.push(`${name} is required in production but is unset.`);
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    problems.push(`${name} is set but is not a valid URL.`);
    return;
  }
  if (protocols && !protocols.includes(url.protocol)) {
    problems.push(
      `${name} must use one of ${protocols.join(", ")} (got "${url.protocol}").`,
    );
  }
}

/**
 * Require a var to be present and non-empty.
 *
 * @param {string} name
 * @param {string} reason
 */
function requirePresent(name, reason) {
  if (!process.env[name]) {
    problems.push(`${name} is required in production (${reason}).`);
  }
}

// Database: the app is useless in production without it, and migrations below
// would silently skip. Accept the common Postgres URL schemes.
requireUrl("DATABASE_URL", ["postgres:", "postgresql:"]);

// Public base URL: share links, Open Graph, and PWA metadata are wrong without
// a real absolute URL.
requireUrl("NEXT_PUBLIC_APP_URL", ["http:", "https:"]);

// Auth: production fail-closes without real Clerk keys (see src/env.js). Assert
// them here too so the failure is a clear preflight message, not a late throw.
requirePresent(
  "CLERK_SECRET_KEY",
  "auth must not fall back to dev-bypass in production",
);
requirePresent(
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "auth must not fall back to dev-bypass in production",
);

if (process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "1") {
  problems.push(
    'NEXT_PUBLIC_DEV_AUTH_BYPASS must not be "1" in production — dev-bypass ' +
      "auth is a local/test-only affordance.",
  );
}

if (problems.length > 0) {
  console.error(
    "\n❌ Production deploy preflight failed — fix the following before deploying:\n" +
      problems.map((p) => `   • ${p}`).join("\n") +
      "\n\nSee DEPLOY.md → “Environment variables” for the required-for-production list.\n",
  );
  process.exit(1);
}

console.log("[preflight] Production environment configuration looks good.");
process.exit(0);
