import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const clerk = vi.hoisted(() => vi.fn(() => NextResponse.next()));
vi.mock('@clerk/nextjs/server', () => ({ clerkMiddleware: () => clerk }));

describe('portable liveness middleware', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    clerk.mockClear();
  });

  it('bypasses Clerk only for the exact liveness path while preserving CSP and locale', async () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NEXT_PUBLIC_DEV_AUTH_BYPASS', '');
    vi.stubEnv('E2E_IDENTITY_SELECTOR', '');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_fixture');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    const { default: proxy } = await import('./proxy');
    const event = {} as NextFetchEvent;
    const response = await proxy(new NextRequest('https://target.example/api/health/live'), event);
    expect(clerk).not.toHaveBeenCalled();
    expect(response?.headers.get('content-security-policy')).toContain('nonce-');
    expect(response?.headers.get('set-cookie')).toContain('NEXT_LOCALE=');
    for (const path of ['/recipes', '/api/health', '/api/health/live/extra']) {
      await proxy(new NextRequest(`https://target.example${path}`), event);
    }
    expect(clerk).toHaveBeenCalledTimes(3);
  });
});
