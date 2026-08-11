import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: { transaction: vi.fn(), query: {} },
}));

vi.mock('~/server/db', () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import {
  allocateUserSlug,
  isUserSlugConflict,
  uniqueUserSlug,
  withUserSlugConflictRetry,
} from './slug';

/** A Postgres unique-violation on the live `users.slug` constraint. */
function liveConflict(): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "users_slug_unique"'),
    { code: '23505', constraint: 'users_slug_unique' },
  );
}

/** A Postgres unique-violation on the alias table's primary key. */
function aliasConflict(): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "user_slug_aliases_pkey"'),
    { code: '23505', constraint: 'user_slug_aliases_pkey' },
  );
}

/**
 * Minimal transaction stand-in exposing just the two lookups `uniqueUserSlug`
 * performs: the live users table and the retained alias history.
 */
function fakeTx(userFindFirst: ReturnType<typeof vi.fn>, aliasFindFirst: ReturnType<typeof vi.fn>) {
  return {
    query: {
      users: { findFirst: userFindFirst },
      userSlugAliases: { findFirst: aliasFindFirst },
    },
  } as unknown as Parameters<typeof uniqueUserSlug>[0];
}

const free = () => vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isUserSlugConflict', () => {
  it('matches both structures that make a user slug unique', () => {
    expect(isUserSlugConflict(liveConflict())).toBe(true);
    expect(isUserSlugConflict(aliasConflict())).toBe(true);
  });

  it('matches a constraint name embedded in the message', () => {
    expect(
      isUserSlugConflict(
        Object.assign(new Error('duplicate key ... "users_slug_unique"'), {
          code: '23505',
        }),
      ),
    ).toBe(true);
  });

  it('unwraps a wrapped cause', () => {
    expect(isUserSlugConflict(new Error('wrapped', { cause: liveConflict() }))).toBe(true);
  });

  it('ignores unrelated failures', () => {
    expect(isUserSlugConflict(new Error('boom'))).toBe(false);
    expect(
      isUserSlugConflict(
        Object.assign(new Error('other'), {
          code: '23505',
          constraint: 'recipes_slug_uq',
        }),
      ),
    ).toBe(false);
  });
});

describe('uniqueUserSlug', () => {
  it('returns the base when nothing holds it', async () => {
    const slug = await uniqueUserSlug(fakeTx(free(), free()), 'gran-lucia');
    expect(slug).toBe('gran-lucia');
  });

  it('perturbs past a slug held by a live user', async () => {
    const userFindFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: 'user_9' })
      .mockResolvedValue(undefined);
    const slug = await uniqueUserSlug(fakeTx(userFindFirst, free()), 'gran-lucia');
    expect(slug).not.toBe('gran-lucia');
    expect(slug.startsWith('gran-lucia-')).toBe(true);
  });

  it('treats a retained alias as occupied', async () => {
    // The rule that keeps redirects honest: if a released slug could be
    // re-claimed, every old link bearing it would resolve to a stranger.
    const aliasFindFirst = vi
      .fn()
      .mockResolvedValueOnce({ slug: 'gran-lucia' })
      .mockResolvedValue(undefined);
    const slug = await uniqueUserSlug(fakeTx(free(), aliasFindFirst), 'gran-lucia');
    expect(slug).not.toBe('gran-lucia');
    expect(slug.startsWith('gran-lucia-')).toBe(true);
  });

  it('perturbs past a reserved slug without touching the database', async () => {
    const userFindFirst = free();
    const aliasFindFirst = free();
    const slug = await uniqueUserSlug(fakeTx(userFindFirst, aliasFindFirst), 'new');
    expect(slug).not.toBe('new');
    expect(userFindFirst).toHaveBeenCalledTimes(1);
  });

  it('never exceeds the column width', async () => {
    const userFindFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: 'user_9' })
      .mockResolvedValue(undefined);
    const slug = await uniqueUserSlug(fakeTx(userFindFirst, free()), 'a'.repeat(60));
    expect(slug.length).toBeLessThanOrEqual(60);
  });
});

describe('allocateUserSlug', () => {
  it('prefers the handle', async () => {
    const slug = await allocateUserSlug(fakeTx(free(), free()), {
      handle: 'GranLucia',
      name: 'Gran Lucia',
    });
    expect(slug).toBe('granlucia');
  });

  it('falls back to the display name when there is no handle', async () => {
    const slug = await allocateUserSlug(fakeTx(free(), free()), {
      handle: null,
      name: 'Gran Lucia',
    });
    expect(slug).toBe('gran-lucia');
  });

  it('falls back to an opaque slug when nothing usable survives', async () => {
    const slug = await allocateUserSlug(fakeTx(free(), free()), {
      handle: null,
      name: '日本語',
    });
    expect(slug.startsWith('cook-')).toBe(true);
  });
});

describe('withUserSlugConflictRetry', () => {
  it('retries a lost race and succeeds', async () => {
    const op = vi.fn().mockRejectedValueOnce(liveConflict()).mockResolvedValue('ok');
    await expect(withUserSlugConflictRetry(op)).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt budget', async () => {
    const op = vi.fn().mockRejectedValue(liveConflict());
    await expect(withUserSlugConflictRetry(op)).rejects.toThrow();
    expect(op).toHaveBeenCalledTimes(5);
  });

  it('never retries an unrelated failure', async () => {
    const op = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(withUserSlugConflictRetry(op)).rejects.toThrow('boom');
    expect(op).toHaveBeenCalledTimes(1);
  });
});
