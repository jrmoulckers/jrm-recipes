import { defineConfig, devices } from '@playwright/test';

// Several worktrees of this repo are often checked out at once, and each may be
// running its own `pnpm start`. With a hardcoded port, `reuseExistingServer`
// silently attaches to whichever tree happened to claim 3000 first, so a spec
// can pass or fail against a build and database that are not the ones under
// test. `E2E_PORT` lets a run claim its own port; CI leaves it unset.
const port = process.env.E2E_PORT ?? '3000';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Fail the CI build if a `test.only` is committed by mistake.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Keep the HTML report for local triage of a failed run, and emit GitHub
  // annotations in CI. `open: "never"` keeps the run non-interactive so a failed
  // local run doesn't hang waiting to launch a browser (issue #250).
  //
  // CI also writes a JSON report, because neither of the other two can answer
  // "which tests skipped": the GitHub reporter annotates failures only, and the
  // dot output shows positions without names. scripts/check-e2e-skips.mjs reads
  // it and fails when skips grow (issue #843).
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'playwright-report/results.json' }],
      ]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Diagnostics for a failing journey: a screenshot at the point of failure
    // and the video of the failed attempt only. "only-on-failure" /
    // "retain-on-failure" keep green runs cheap and artifacts deterministic.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    // In CI the production build is produced once by the `build` job and
    // downloaded as an artifact (#244), so just start it with no second compile.
    // Locally there's no artifact, so build first, then start.
    command: process.env.CI
      ? `pnpm start --port ${port}`
      : `pnpm build && pnpm start --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      SKIP_ENV_VALIDATION: '1',
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_DEV_AUTH_BYPASS: '1',
      // Forward a caller-provided DATABASE_URL so the built server talks to the
      // seeded Postgres, letting data-backed journeys (recipe detail, Cook Mode)
      // run. When unset, data-dependent specs skip gracefully (issue #233).
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
