import { existsSync, statSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT ?? '43153';
const baseURL = `http://localhost:${port}`;
const ownerState = '.clerk/owner-e2e.json';
const databaseUrl = process.env.DATABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const secretKey = process.env.CLERK_SECRET_KEY;

if (
  process.env.E2E_CLERK_ISOLATED !== '1' ||
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === '1' ||
  process.env.E2E_IDENTITY_SELECTOR === '1' ||
  process.env.SKIP_ENV_VALIDATION !== undefined ||
  process.env.VERCEL_ENV ||
  !publishableKey?.startsWith('pk_test_') ||
  !secretKey?.startsWith('sk_test_') ||
  !databaseUrl ||
  !/^\d{1,5}$/.test(port) ||
  Number(port) === 0 ||
  Number(port) > 65535
) {
  throw new Error(
    'Clerk E2E requires explicit isolated-test opt-in, test-instance Clerk keys, a local DATABASE_URL, and a valid E2E_PORT; dev bypass, identity selector, env-validation skip, and Vercel environments are forbidden.',
  );
}

const database = new URL(databaseUrl);
if (
  !['postgres:', 'postgresql:'].includes(database.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
  !database.pathname.slice(1).endsWith('_clerk_e2e')
) {
  throw new Error(
    'Clerk E2E DATABASE_URL must target a loopback PostgreSQL database named *_clerk_e2e.',
  );
}

if (!existsSync(ownerState) || !statSync(ownerState).isFile()) {
  throw new Error(
    `Clerk E2E needs the operator-provided, git-ignored ${ownerState} before starting.`,
  );
}

export default defineConfig({
  testDir: './tests/clerk-e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm build && pnpm start --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: databaseUrl,
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_DEV_AUTH_BYPASS: '0',
      E2E_IDENTITY_SELECTOR: '0',
      SKIP_ENV_VALIDATION: '',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
