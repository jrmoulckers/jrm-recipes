import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Fail the CI build if a `test.only` is committed by mistake.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Keep the HTML report for local triage of a failed run, and emit GitHub
  // annotations in CI. `open: "never"` keeps the run non-interactive so a failed
  // local run doesn't hang waiting to launch a browser (issue #250).
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Diagnostics for a failing journey: a screenshot at the point of failure
    // and the video of the failed attempt only. "only-on-failure" /
    // "retain-on-failure" keep green runs cheap and artifacts deterministic.
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      SKIP_ENV_VALIDATION: "1",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_DEV_AUTH_BYPASS: "1",
      // Forward a caller-provided DATABASE_URL so the built server talks to the
      // seeded Postgres, letting data-backed journeys (recipe detail, Cook Mode)
      // run. When unset, data-dependent specs skip gracefully (issue #233).
      ...(process.env.DATABASE_URL
        ? { DATABASE_URL: process.env.DATABASE_URL }
        : {}),
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
