import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Erasure orchestration tests (issue #678).
 *
 * These assert the *ordering and completeness* guarantees, which are the part
 * that has to be right: media bytes destroyed before the rows that name them,
 * third parties' content preserved, a loud failure instead of a silent partial
 * deletion, and a tombstone that carries no identifier.
 */

const { state, db, purge, envMock, holds } = vi.hoisted(() => {
  const state = {
    configured: true,
    user: undefined as { id: string; clerkId: string | null; email: string | null } | undefined,
    /** Every mutating call, in order, as `"<verb> <table>"`. */
    calls: [] as string[],
    selects: [] as unknown[][],
    inserted: null as Record<string, unknown> | null,
    purgeFailed: [] as string[],
    userSurvives: false,
    /** What `findEntanglement` reports. Empty is the common, unentangled case. */
    entangled: [] as string[],
  };

  const table = (t: unknown) =>
    // Drizzle stores the table name under a well-known symbol; `getTableName`
    // just reads it. Can't import here (this block is hoisted above imports).
    (t as Record<symbol, string>)?.[Symbol.for('drizzle:Name')] ?? 'unknown';

  const makeChain = (verb: string, t: unknown) => {
    const chain = {
      set: vi.fn(() => chain),
      values: vi.fn((v: Record<string, unknown>) => {
        state.inserted = v;
        return chain;
      }),
      onConflictDoNothing: vi.fn(async () => undefined),
      where: vi.fn(() => chain),
      returning: vi.fn(async () => {
        state.calls.push(`${verb} ${table(t)}`);
        return [{ id: 'x' }];
      }),
      then: (resolve: (v: unknown) => unknown) => {
        state.calls.push(`${verb} ${table(t)}`);
        return resolve(undefined);
      },
    };
    return chain;
  };

  const selectChain = () => {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(async () => state.selects.shift() ?? []),
      then: (resolve: (v: unknown) => unknown) => resolve(state.selects.shift() ?? []),
    };
    return chain;
  };

  const db = {
    query: {
      users: { findFirst: vi.fn(async () => state.user) },
    },
    select: vi.fn(() => selectChain()),
    insert: vi.fn((t: unknown) => makeChain('insert', t)),
    update: vi.fn((t: unknown) => makeChain('update', t)),
    delete: vi.fn((t: unknown) => makeChain('delete', t)),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      state.calls.push('BEGIN');
      await fn(db);
      state.calls.push('COMMIT');
    }),
  };

  const purge = {
    purgeUserMedia: vi.fn(async () => {
      state.calls.push('purge cloudinary');
      return { purged: 3, failed: state.purgeFailed, skippedExternal: 0 };
    }),
    isPurgeComplete: (r: { failed: string[] }) => r.failed.length === 0,
    deleteUserMediaRows: vi.fn(async () => {
      state.calls.push('delete media_assets');
      return 3;
    }),
  };

  const envMock = { env: { DELETION_HASH_SALT: 'a-sufficiently-long-salt' } };

  const holds = {
    findEntanglement: vi.fn(async () => ({
      reason: 'co_created_entanglement' as const,
      recipeIds: state.entangled,
    })),
    recordErasureHold: vi.fn(async () => {
      state.calls.push('record erasure_hold');
    }),
  };

  return { state, db, purge, envMock, holds };
});

vi.mock('~/server/db', () => ({ db, isDbConfigured: () => state.configured }));
vi.mock('~/server/media/purge', () => purge);
vi.mock('~/env', () => envMock);
vi.mock('~/server/users/erasure-holds', () => holds);

import { eraseUserAccount, hashDeletionSubject } from './erasure';

beforeEach(() => {
  state.configured = true;
  state.user = { id: 'u1', clerkId: 'clerk_1', email: 'nonna@example.com' };
  state.calls = [];
  state.selects = [];
  state.inserted = null;
  state.purgeFailed = [];
  state.userSurvives = false;
  state.entangled = [];
  vi.clearAllMocks();
});

/**
 * Queue the sequence of `db.select()` results the orchestrator reads, in the
 * order it reads them.
 */
function queueSelects(options?: {
  owned?: { id: string }[];
  coCreated?: { recipeId: string }[];
  rated?: { recipeId: string }[];
  comments?: { id: string }[];
}) {
  state.selects = [
    options?.owned ?? [],
    options?.coCreated ?? [],
    options?.rated ?? [],
    options?.comments ?? [],
    // Post-transaction assertions: users row gone, no orphan recipes.
    [],
    [],
  ];
}

describe('eraseUserAccount', () => {
  it('destroys media bytes before deleting the rows that name them', async () => {
    queueSelects({ owned: [{ id: 'r1' }] });
    await eraseUserAccount('u1', { trigger: 'clerk_webhook' });

    const purgeAt = state.calls.indexOf('purge cloudinary');
    const mediaRowsAt = state.calls.indexOf('delete media_assets');
    const usersAt = state.calls.indexOf('delete users');

    expect(purgeAt).toBeGreaterThanOrEqual(0);
    // Bytes first. Reversing this strands live CDN images with nothing left
    // pointing at them, which is the failure `restrict` exists to prevent.
    expect(purgeAt).toBeLessThan(mediaRowsAt);
    expect(mediaRowsAt).toBeLessThan(usersAt);
  });

  it("deletes the user's own recipes before the users row", async () => {
    queueSelects({ owned: [{ id: 'r1' }, { id: 'r2' }] });
    await eraseUserAccount('u1', { trigger: 'in_app' });

    const recipesAt = state.calls.indexOf('delete recipes');
    const usersAt = state.calls.indexOf('delete users');
    expect(recipesAt).toBeGreaterThanOrEqual(0);
    expect(recipesAt).toBeLessThan(usersAt);
  });

  it('refuses to delete anything when media bytes survived', async () => {
    state.purgeFailed = ['heirloom/a1'];
    queueSelects();

    await expect(eraseUserAccount('u1', { trigger: 'clerk_webhook' })).rejects.toThrow(
      /MEDIA_PURGE_INCOMPLETE/,
    );

    // A retryable partial failure, not a half-erased account.
    expect(state.calls).not.toContain('delete users');
    expect(state.calls).not.toContain('BEGIN');
  });

  /**
   * The `ON DELETE` action `retainedRecipeCount`'s measurement note is premised
   * on (#736).
   *
   * `erasure.ts` documents two bases for tightening the bound from "recipes the
   * user could have edited" to "recipes they did", and says they need different
   * treatment: `recipe_versions` is preserved by ordering alone, while
   * `recipe_events` is not, because `actorId` is `set null` and the `users`
   * delete detaches it regardless of where a capture step sits.
   *
   * That asymmetry is the entire content of the note, and it lives in a foreign
   * key rather than a call site. Flipping `actorId` to `cascade` would make the
   * two bases behave alike and the note actively wrong — while every ordering
   * assertion in this file stays green, because no call site changes. Most
   * sibling FKs on `recipes.ts` are `cascade`, so the flip reads as a
   * consistency cleanup, which is the direction #716 records as dangerous.
   */
  it('keeps recipe_events.actorId set-null, which the measurement note assumes', () => {
    // Quote style is a formatting concern. Normalize it at the read so a Prettier
    // config change cannot turn these assertions into ones that match nothing.
    const schema = readFileSync(
      join(resolve(dirname(fileURLToPath(import.meta.url)), '../db/schema'), 'recipes.ts'),
      'utf8',
    ).replace(/'/g, '"');

    // The `recipeEvents` table body, from its declaration to the next export.
    const start = schema.indexOf('export const recipeEvents');
    expect(
      start,
      'recipeEvents declaration not found — has it been renamed?',
    ).toBeGreaterThanOrEqual(0);
    const next = schema.indexOf('\nexport const ', start + 1);
    const body = schema.slice(start, next === -1 ? undefined : next);

    const actorId = /actorId:\s*fk\(\)[\s\S]*?onDelete:\s*"([\w ]+)"/.exec(body);

    expect(
      actorId?.[1],
      'recipe_events.actorId is no longer `set null`. The measurement note in ' +
        'erasure.ts says the users delete detaches these rows regardless of ' +
        'where a capture step sits, and that the basis therefore differs from ' +
        'recipe_versions. Changing this does not trip the ordering checks ' +
        'above — it changes what they are guarding.',
    ).toBe('set null');
  });

  it('counts every accepted non-owned creator row, edited or not (upper bound)', async () => {
    queueSelects({
      owned: [{ id: 'r1' }],
      // `r1` is their own; only `r9` is somebody else's recipe they co-create.
      coCreated: [{ recipeId: 'r1' }, { recipeId: 'r9' }],
    });

    const result = await eraseUserAccount('u1', { trigger: 'in_app' });
    // Note what is absent from the fixture: nothing describes whether the user
    // ever edited `r9`. The count is derived from creator rows alone, so it is
    // an upper bound on the #694 remediation population rather than a count of
    // recipes carrying their prose (#728).
    expect(result.retainedRecipeCount).toBe(1);
  });

  /**
   * Containment for #694. The erasure of an entangled account destroys the only
   * evidence of which words in a co-created recipe were the departing user's:
   * their `recipe_versions` rows are deleted outright, and `authorId` is
   * `set null`, so the `users` delete severs the attribution independently.
   * Both are irreversible, so the halt has to precede every destructive step —
   * including the media purge, which is equally final.
   */
  describe('co-creator containment (#694)', () => {
    it('deletes nothing at all when the user is entangled', async () => {
      state.entangled = ['r9'];
      queueSelects({ owned: [{ id: 'r1' }] });

      const result = await eraseUserAccount('u1', { trigger: 'clerk_webhook' });

      expect(result.status).toBe('held');
      expect(result.entangledRecipeIds).toEqual(['r9']);
      expect(result.counts).toEqual({});

      // Not "deleted less". Nothing ran: no transaction, no media bytes, no
      // version rows, and no `users` delete — the second destruction path,
      // which ordering alone would not have contained.
      expect(state.calls).not.toContain('BEGIN');
      expect(state.calls).not.toContain('purge cloudinary');
      expect(state.calls).not.toContain('delete recipe_versions');
      expect(state.calls).not.toContain('delete recipes');
      expect(state.calls).not.toContain('delete users');
      expect(state.calls).not.toContain('delete media_assets');
    });

    it('records the held request durably before returning', async () => {
      state.entangled = ['r9', 'r12'];
      queueSelects();

      await eraseUserAccount('u1', {
        trigger: 'in_app',
        noticeVersion: 'delete-account-v1',
      });

      // A dropped request that leaves no trace is itself a compliance failure:
      // the subject asked, and nothing recorded that they did.
      expect(holds.recordErasureHold).toHaveBeenCalledWith(
        'u1',
        { reason: 'co_created_entanglement', recipeIds: ['r9', 'r12'] },
        { trigger: 'in_app', noticeVersion: 'delete-account-v1' },
      );
    });

    it('writes no tombstone for a held request', async () => {
      state.entangled = ['r9'];
      queueSelects();

      await eraseUserAccount('u1', { trigger: 'clerk_webhook' });

      // `deletion_records.completedAt` is the completion proof. Writing one here
      // would evidence an erasure that did not happen.
      expect(state.inserted).toBeNull();
    });

    it('leaves the unentangled common case exactly as it was', async () => {
      state.entangled = [];
      queueSelects({ owned: [{ id: 'r1' }], coCreated: [{ recipeId: 'r1' }] });

      const result = await eraseUserAccount('u1', { trigger: 'in_app' });

      // The guard is narrow by construction. Most accounts share nothing, and
      // for them the erasure must still run start to finish, today, unchanged.
      expect(result.status).toBe('erased');
      expect(holds.recordErasureHold).not.toHaveBeenCalled();
      expect(state.calls).toContain('purge cloudinary');
      expect(state.calls).toContain('delete recipe_versions');
      expect(state.calls).toContain('delete users');
      expect(state.inserted?.completedAt).toBeInstanceOf(Date);
    });

    it('checks entanglement before the media purge, not after', async () => {
      state.entangled = ['r9'];
      queueSelects();

      await eraseUserAccount('u1', { trigger: 'admin' });

      // Cloudinary bytes are destroyed remotely and are unrecoverable. A guard
      // placed after the purge would contain the database and still have
      // deleted the photographs.
      expect(state.calls).toEqual(['record erasure_hold']);
    });
  });

  it('is a no-op for an already-erased subject', async () => {
    state.user = undefined;
    const result = await eraseUserAccount('u1', { trigger: 'clerk_webhook' });

    // Clerk retries `user.deleted`; throwing here would make it redeliver
    // forever against an account that is already gone.
    expect(result.counts).toEqual({});
    expect(state.calls).toEqual([]);
  });

  it('refuses to run when the database is unconfigured', async () => {
    state.configured = false;
    await expect(eraseUserAccount('u1', { trigger: 'admin' })).rejects.toThrow(/NOT_CONFIGURED/);
  });

  it('writes a tombstone carrying only hashes and counts', async () => {
    queueSelects({ owned: [{ id: 'r1' }] });
    await eraseUserAccount('u1', {
      trigger: 'in_app',
      noticeVersion: 'delete-account-v1',
    });

    const row = state.inserted!;
    expect(row.subjectHash).toBe(hashDeletionSubject('u1'));
    expect(row.clerkIdHash).toBe(hashDeletionSubject('clerk_1'));
    expect(row.noticeVersion).toBe('delete-account-v1');
    expect(row.completedAt).toBeInstanceOf(Date);

    // The tombstone outlives the data it describes, so it must not re-create
    // the identifiers the erasure just removed.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('u1');
    expect(serialized).not.toContain('clerk_1');
    expect(serialized).not.toContain('nonna@example.com');
  });
});

describe('hashDeletionSubject', () => {
  it('is deterministic so a restored row can be matched back', () => {
    expect(hashDeletionSubject('u1')).toBe(hashDeletionSubject('u1'));
  });

  it('is salt-dependent, so a bare id hash is not confirmable', () => {
    expect(hashDeletionSubject('u1', 'salt-one-long-enough')).not.toBe(
      hashDeletionSubject('u1', 'salt-two-long-enough'),
    );
  });

  it('returns null rather than a guessable digest when no salt is set', () => {
    expect(hashDeletionSubject('u1', '')).toBeNull();
  });
});
