import { describe, expect, it } from 'vitest';

import { findProductionAuthIssues, isProductionDeploy } from '~/env';
import { assertDevBypassAllowed } from '~/server/auth';

const CLERK = {
  CLERK_SECRET_KEY: 'sk_live_x',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_x',
};

describe('findProductionAuthIssues', () => {
  it('is inert outside production, even with dev-bypass and no keys', () => {
    for (const NODE_ENV of ['development', 'test', undefined]) {
      expect(
        findProductionAuthIssues({
          NODE_ENV,
          NEXT_PUBLIC_DEV_AUTH_BYPASS: '1',
        }),
      ).toEqual([]);
    }
  });

  it('passes a correctly configured production deploy', () => {
    expect(findProductionAuthIssues({ NODE_ENV: 'production', ...CLERK })).toEqual([]);
  });

  it('flags the dev-bypass flag in production', () => {
    const issues = findProductionAuthIssues({
      NODE_ENV: 'production',
      NEXT_PUBLIC_DEV_AUTH_BYPASS: '1',
      ...CLERK,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('NEXT_PUBLIC_DEV_AUTH_BYPASS');
  });

  it('flags missing Clerk keys in production', () => {
    const issues = findProductionAuthIssues({ NODE_ENV: 'production' });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('CLERK_SECRET_KEY');
  });

  it('flags a single missing Clerk key in production', () => {
    const issues = findProductionAuthIssues({
      NODE_ENV: 'production',
      CLERK_SECRET_KEY: 'sk_live_x',
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  });

  it('flags the identity selector in production', () => {
    // Condition 3 of the dev-identity selector (#783/#786) was "nothing
    // outside CI sets this", which was true of our config but unenforced by
    // the app. #783 happened because a condition stated only in prose had
    // never been implemented, so this one is checked rather than trusted.
    const issues = findProductionAuthIssues({
      NODE_ENV: 'production',
      E2E_IDENTITY_SELECTOR: '1',
      ...CLERK,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('E2E_IDENTITY_SELECTOR');
  });

  it('ignores the identity selector when it is not exactly \u00221\u0022', () => {
    // Mirrors `isIdentitySelectorEnabled`, which only honours "1". A stricter
    // rule here would refuse to boot on a value the selector ignores anyway.
    for (const off of [undefined, '', '0', 'true', 'yes']) {
      expect(
        findProductionAuthIssues({
          NODE_ENV: 'production',
          E2E_IDENTITY_SELECTOR: off,
          ...CLERK,
        }),
        String(off),
      ).toEqual([]);
    }
  });

  it('reports both problems when bypass is on and keys are missing', () => {
    const issues = findProductionAuthIssues({
      NODE_ENV: 'production',
      NEXT_PUBLIC_DEV_AUTH_BYPASS: '1',
    });

    expect(issues).toHaveLength(2);
  });

  it('reports every problem at once rather than the first', () => {
    const issues = findProductionAuthIssues({
      NODE_ENV: 'production',
      NEXT_PUBLIC_DEV_AUTH_BYPASS: '1',
      E2E_IDENTITY_SELECTOR: '1',
    });

    expect(issues).toHaveLength(3);
  });
});

describe('isProductionDeploy', () => {
  it('is true only for a real Vercel production deploy', () => {
    expect(isProductionDeploy({ VERCEL_ENV: 'production' })).toBe(true);
  });

  it('is false for previews, dev, and non-Vercel contexts', () => {
    expect(isProductionDeploy({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(isProductionDeploy({ VERCEL_ENV: 'development' })).toBe(false);
    expect(isProductionDeploy({})).toBe(false);
  });

  it('is false when env validation is explicitly skipped', () => {
    expect(
      isProductionDeploy({
        VERCEL_ENV: 'production',
        SKIP_ENV_VALIDATION: '1',
      }),
    ).toBe(false);
  });
});

describe('assertDevBypassAllowed', () => {
  it('throws in production (fails closed)', () => {
    expect(() => assertDevBypassAllowed('production', false)).toThrow(/dev-bypass/i);
  });

  it('does not throw when env validation is explicitly skipped', () => {
    // SKIP_ENV_VALIDATION is the single escape hatch (CI build + e2e only).
    expect(() => assertDevBypassAllowed('production', true)).not.toThrow();
  });

  it('does not throw in local dev or test', () => {
    expect(() => assertDevBypassAllowed('development', false)).not.toThrow();
    expect(() => assertDevBypassAllowed('test', false)).not.toThrow();
  });
});
