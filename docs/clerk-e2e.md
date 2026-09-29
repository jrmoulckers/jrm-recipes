# Clerk-backed recipe ownership E2E

This opt-in Playwright path tests the Clerk owner against a **fresh signed-out
browser context**. It is separate from `playwright.config.ts` and the CI E2E job,
which build with dev auth bypass. A green default CI run does **not** validate
this scenario.

## Human setup and approval required

An authorized operator must provision an isolated **local PostgreSQL test
database** whose name ends in `_clerk_e2e`, apply the normal migrations, and configure a **Clerk test instance**
with an expendable owner account. Use test-instance keys (`pk_test_` and
`sk_test_`); never use production accounts, keys, or data. The operator must
create an authenticated Playwright `storageState` snapshot for the owner at
`.clerk/owner-e2e.json` for the exact local origin and verify that it still
signs in. This file is git-ignored and must never be committed or shared.
For example, after starting the app locally with the authorized test-instance
keys and isolated database, run
`pnpm exec playwright codegen --save-storage=.clerk/owner-e2e.json http://localhost:43153`,
sign in as the expendable owner, then close the codegen browser. Supply
`E2E_PORT` consistently if using a different port; the opt-in test's server
must not be running on that port when the test begins.
Provisioning credentials, changing CI/secrets, and running against any
non-isolated environment require human approval. No such environment or
credentials are provisioned by this repository.

With authorized local test inputs supplied in the operator's environment, set
`E2E_CLERK_ISOLATED=1`, `DATABASE_URL` to the isolated loopback PostgreSQL
database, both Clerk test-instance keys, and optionally `E2E_PORT` (default
`43153`). Run `pnpm exec playwright test --config playwright.clerk.config.ts`.
Do not set `NEXT_PUBLIC_DEV_AUTH_BYPASS`, `E2E_IDENTITY_SELECTOR`,
`SKIP_ENV_VALIDATION`, or `VERCEL_ENV`. The config refuses to start when these
guards or the required inputs fail, and never reuses another worktree's server.

The test creates one public recipe through the owner UI, checks owner-only
Edit/Delete and signed-out Sign in/Start your cookbook controls, verifies the
signed-out edit redirect, captures the owner delete action without executing
it, and replays it in the fresh visitor context. It checks the isolated
database remains unchanged, then replays the same payload as owner to
soft-delete the fixture. A failed run before the final replay can leave a
test recipe in the isolated database; clean it up under the operator's local
test-data procedure. Playwright's git-ignored `test-results/` and
`playwright-report/` may contain session data; keep them private and remove
them using the operator's local test-data procedure. No skip or mock is
reported as a Clerk pass.
