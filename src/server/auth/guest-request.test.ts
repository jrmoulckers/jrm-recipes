import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEV_CO_COOK, DEV_IDENTITY_COOKIE, DEV_SIGNED_OUT, DEV_USER } from './dev-user';

const request = vi.hoisted(() => ({
  env: {
    NODE_ENV: 'test',
    CLERK_SECRET_KEY: '',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
    NEXT_PUBLIC_DEV_AUTH_BYPASS: '1',
  },
  cookie: 'e2e_signed_out' as string | undefined,
  cookies: vi.fn(),
  cookieGet: vi.fn(),
  auth: vi.fn(),
  configured: vi.fn(),
  findUser: vi.fn(),
  insert: vi.fn(),
  count: vi.fn(),
}));

vi.mock('~/env', () => ({ env: request.env }));
vi.mock('next/headers', () => ({
  cookies: request.cookies,
}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: request.auth,
}));
vi.mock('~/server/db', () => ({
  isDbConfigured: request.configured,
  db: {
    query: { users: { findFirst: request.findUser } },
    insert: request.insert,
    $count: request.count,
  },
}));
vi.mock('~/server/billing/entitlements', () => ({ getEntitlements: vi.fn() }));
vi.mock('~/lib/analytics/config', () => ({ isAnalyticsConfigured: () => false }));
vi.mock('~/lib/analytics/server', () => ({
  captureServer: vi.fn(),
  identifyServer: vi.fn(),
}));
vi.mock('~/server/users/slug', () => ({ allocateUserSlug: vi.fn() }));
vi.mock('~/server/users/erasure', () => ({
  eraseUserAccount: vi.fn(),
  hasBeenErased: vi.fn(),
}));

import { getAuthState, getCurrentUser, requireUser } from './index';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('E2E_IDENTITY_SELECTOR', '1');
  vi.stubEnv('SKIP_ENV_VALIDATION', undefined);
  Object.assign(request.env, {
    NODE_ENV: 'test',
    CLERK_SECRET_KEY: '',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
    NEXT_PUBLIC_DEV_AUTH_BYPASS: '1',
  });
  request.cookie = DEV_SIGNED_OUT;
  request.cookies.mockResolvedValue({ get: request.cookieGet });
  request.cookieGet.mockImplementation(() =>
    request.cookie === undefined ? undefined : { value: request.cookie },
  );
  request.auth.mockResolvedValue({ userId: null });
  request.configured.mockReturnValue(true);
});

afterEach(() => vi.unstubAllEnvs());

function expectNoDatabaseWork() {
  expect(request.configured).not.toHaveBeenCalled();
  expect(request.findUser).not.toHaveBeenCalled();
  expect(request.insert).not.toHaveBeenCalled();
  expect(request.count).not.toHaveBeenCalled();
}

describe('guest fixture through real request auth wiring (#1209)', () => {
  it('resolves a guest and refuses requireUser before every database operation', async () => {
    expect(await getCurrentUser()).toBeNull();
    expect(await getAuthState()).toEqual({
      isConfigured: false,
      isSignedIn: false,
      user: null,
    });
    await expect(requireUser()).rejects.toThrow('UNAUTHENTICATED');
    expect(request.cookieGet).toHaveBeenCalledWith(DEV_IDENTITY_COOKIE);
    expectNoDatabaseWork();
    expect(request.auth).not.toHaveBeenCalled();
  });

  it.each([undefined, '0', 'true'])(
    'does not read the guest cookie when the selector is disabled (%s)',
    async (flag) => {
      vi.stubEnv('E2E_IDENTITY_SELECTOR', flag);
      request.configured.mockReturnValue(false);
      expect(await getCurrentUser()).toBe(DEV_USER);
      expect(request.cookies).not.toHaveBeenCalled();
      expect(request.auth).not.toHaveBeenCalled();
    },
  );

  it.each([
    { cookie: undefined, identity: DEV_USER },
    { cookie: DEV_USER.id, identity: DEV_USER },
    { cookie: DEV_CO_COOK.id, identity: DEV_CO_COOK },
    { cookie: 'unknown-user', identity: DEV_USER },
  ])('preserves authenticated resolution for cookie $cookie', async ({ cookie, identity }) => {
    request.cookie = cookie;
    request.configured.mockReturnValue(false);
    expect(await getCurrentUser()).toBe(identity);
    expect(request.cookieGet).toHaveBeenCalledWith(DEV_IDENTITY_COOKIE);
  });

  it('ignores the selector entirely on the real signed-out Clerk branch', async () => {
    Object.assign(request.env, {
      CLERK_SECRET_KEY: 'test-only-secret-placeholder',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'test-only-publishable-placeholder',
      NEXT_PUBLIC_DEV_AUTH_BYPASS: '0',
    });
    expect(await getCurrentUser()).toBeNull();
    expect(request.auth).toHaveBeenCalledTimes(1);
    expect(request.cookies).not.toHaveBeenCalled();
    expectNoDatabaseWork();
  });

  it('preserves a real Clerk user despite the guest selector cookie', async () => {
    Object.assign(request.env, {
      CLERK_SECRET_KEY: 'test-only-secret-placeholder',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'test-only-publishable-placeholder',
      NEXT_PUBLIC_DEV_AUTH_BYPASS: '0',
    });
    const clerkUser = { ...DEV_USER, id: 'app-clerk-user', clerkId: 'clerk-test-user' };
    request.auth.mockResolvedValue({ userId: clerkUser.clerkId });
    request.findUser.mockResolvedValue(clerkUser);
    expect(await getCurrentUser()).toBe(clerkUser);
    expect(request.auth).toHaveBeenCalledTimes(1);
    expect(request.findUser).toHaveBeenCalledTimes(1);
    expect(request.cookies).not.toHaveBeenCalled();
    expect(request.insert).not.toHaveBeenCalled();
  });

  it('refuses production bypass before reading the sentinel or touching the database', async () => {
    request.env.NODE_ENV = 'production';
    await expect(getCurrentUser()).rejects.toThrow('Refusing to serve the shared dev-bypass user');
    expect(request.cookies).not.toHaveBeenCalled();
    expect(request.auth).not.toHaveBeenCalled();
    expectNoDatabaseWork();
  });
});
