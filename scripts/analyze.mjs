#!/usr/bin/env node
/**
 * Build the app with @next/bundle-analyzer enabled so it emits an interactive
 * treemap of the client bundle to `.next/analyze/client.html` (see
 * next.config.js). Cross-platform wrapper so `pnpm analyze` works the same on
 * Windows, macOS, and Linux without needing `cross-env`.
 */
import { spawnSync } from "node:child_process";

const res = spawnSync("next build", {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    ANALYZE: "true",
    // Analysis doesn't need real env/secrets; keep it runnable anywhere.
    SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION ?? "1",
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  },
});

if (res.status === 0) {
  console.log("\nBundle report written to .next/analyze/client.html");
}
process.exit(res.status ?? 1);
