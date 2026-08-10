import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';

vi.mock('server-only', () => ({}));

// Only the transaction entrypoint is exercised here. The retry wrapper lives
// *outside* the transaction callback, so a mocked `transaction` lets us drive
// the collision/retry paths without a real database.
const { dbMock } = vi.hoisted(() => ({
  dbMock: { transaction: vi.fn() },
}));

vi.mock('~/server/db', () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import { recipes, recipeSlugAliases, recipeVersions, type User } from '~/server/db/schema';
import { isReservedRecipeSlug } from '~/lib/recipe-reserved-slugs';
import { recipeInput } from './validation';
import {
  createRecipe,
  deleteRecipe,
  forkRecipe,
  isSlugConflict,
  isVersionConflict,
  resolveGroupId,
  revertRecipe,
  updateRecipe,
  uniqueSlug,
} from './mutations';

const author = { id: 'user_1' } as User;
const input = recipeInput.parse({ title: 'Apple Pie' });

/** A Postgres unique-violation on the recipes per-author slug constraint. */
function slugConflict(): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "recipes_author_slug_uq"'),
    { code: '23505', constraint: 'recipes_author_slug_uq' },
  );
}

/** A Postgres unique-violation on the recipe_slug_aliases (owner_id, slug) constraint. */
function aliasConflict(): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "recipe_slug_aliases_owner_slug_uq"'),
    { code: '23505', constraint: 'recipe_slug_aliases_owner_slug_uq' },
  );
}

/** A Postgres unique-violation on the recipe_creators (user_id, slug) constraint. */
function creatorSlugConflict(): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "recipe_creators_user_slug_uq"'),
    { code: '23505', constraint: 'recipe_creators_user_slug_uq' },
  );
}

/** A Postgres unique-violation on the recipe_versions (recipe_id, version_number) constraint. */
function versionConflict(): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "recipe_versions_recipe_version_uq"'),
    { code: '23505', constraint: 'recipe_versions_recipe_version_uq' },
  );
}

/**
 * Minimal transaction stand-in exposing just the surface `uniqueSlug` reads: the
 * caller's live recipes, their retained slug aliases, and the recipes they
 * co-create (issue #668), plus the `execute` used to take the per-namespace
 * advisory lock.
 */
function fakeTx(
  findFirst: ReturnType<typeof vi.fn>,
  findAlias: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
  findCreator: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
  execute: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
) {
  return {
    execute,
    query: {
      recipes: { findFirst },
      recipeSlugAliases: { findFirst: findAlias },
      recipeCreators: { findFirst: findCreator },
    },
  } as unknown as Parameters<typeof uniqueSlug>[0];
}

const OWNER = 'user_1';

beforeEach(() => {
  dbMock.transaction.mockReset();
});

/**
 * The namespace lock must stay transaction-scoped (issue #740).
 *
 * `pg_advisory_xact_lock` -> `pg_advisory_lock` is a five-character edit that
 * type-checks, lints, and passes every behavioural test in this file, because
 * it still *takes* the lock. It just never releases it: session-scoped locks
 * outlive `COMMIT`. On the pooled, long-lived connection this app uses
 * (`server/db/index.ts`, `max: 1` in production), re-entrancy then lets that
 * same connection re-acquire the key forever, so the lock reports success while
 * serializing nothing — the exact duplicate-slug race it exists to prevent.
 *
 * A behavioural test cannot see this: the mocked transaction has no lock
 * manager, and the real failure needs a second connection. So it is asserted
 * against the source.
 *
 * Both literals are pinned, because a negative assertion rots open (#724/#732):
 * a misspelled ban is always absent, which is what passing looks like. The
 * sanctioned form is pinned by having to appear in the code; the banned form is
 * pinned to the sanctioned one by construction — it is the same name without
 * `xact_`. Rotting either breaks the derivation, so neither can silently become
 * a no-op. (Verified: pinning only the sanctioned literal was not enough, and a
 * rotted ban passed 49/49.)
 */
describe('slug namespace lock scope (issue #740)', () => {
  const TXN_SCOPED = 'pg_advisory_xact_lock(';
  const SESSION_SCOPED = 'pg_advisory_lock(';

  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'mutations.ts'),
    'utf8',
  );

  // Doc comments name the session-scoped form deliberately, to warn against it.
  // Both checks read code only: anchoring against the full source would let the
  // warning satisfy the anchor, so deleting the lock call outright would leave
  // this guard green. (Verified: it did.)
  const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '');

  it('pins both literals, so neither ban nor anchor can rot into a no-op', () => {
    // The banned form is the sanctioned form minus `xact_`. Stating that as a
    // derivation means a typo in *either* constant fails here.
    expect(
      TXN_SCOPED,
      'the two lock literals are no longer the same Postgres function name ' +
        'with and without `xact_`. One of them is misspelled, and a ' +
        'misspelled ban can never fire.',
    ).toBe(SESSION_SCOPED.replace('advisory_', 'advisory_xact_'));

    // The anchor must not be satisfied by the thing it is anchoring.
    expect(TXN_SCOPED.includes(SESSION_SCOPED)).toBe(false);
  });

  it('still takes a transaction-scoped lock, which anchors the ban below', () => {
    expect(
      code.includes(TXN_SCOPED),
      `${TXN_SCOPED} no longer appears in mutations.ts code — the namespace ` +
        'lock has been removed or renamed.',
    ).toBe(true);
  });

  it('never uses the session-scoped form, which outlives the transaction', () => {
    expect(
      code.includes(SESSION_SCOPED),
      'mutations.ts uses the session-scoped `pg_advisory_lock(`. That lock ' +
        'survives COMMIT and is released only on disconnect. On the pooled ' +
        'connection (server/db/index.ts, `max: 1`) it leaks, and advisory ' +
        'locks are re-entrant, so the same connection keeps re-acquiring it ' +
        'and the lock silently stops excluding anything. Use ' +
        '`pg_advisory_xact_lock(`.',
    ).toBe(false);
  });
});

describe('recipes slug uniqueness (schema)', () => {
  it('is enforced per author at the database level, not just in app code', () => {
    const { uniqueConstraints, indexes } = getTableConfig(recipes);

    // Namespaced URLs (issue #666): two cooks may each hold `apple-pie`, so the
    // constraint is (author_id, slug), never slug alone.
    const slugUq = uniqueConstraints.find((u) => u.name === 'recipes_author_slug_uq');
    expect(slugUq).toBeDefined();
    expect(slugUq?.columns.map((c) => c.name)).toEqual(['authorId', 'slug']);
    expect(uniqueConstraints.some((u) => u.name === 'recipes_slug_uq')).toBe(false);

    // The old non-unique index was replaced by the unique constraint (whose
    // btree index still backs slug lookups), so getRecipe-by-slug resolves at
    // most one row per namespace.
    expect(indexes.some((i) => i.config.name === 'recipes_slug_idx')).toBe(false);
  });

  it('keeps every retired slug unique inside its namespace', () => {
    const { uniqueConstraints, indexes } = getTableConfig(recipeSlugAliases);

    const ownerSlugUq = uniqueConstraints.find(
      (u) => u.name === 'recipe_slug_aliases_owner_slug_uq',
    );
    expect(ownerSlugUq?.columns.map((c) => c.name)).toEqual(['ownerId', 'slug']);

    // The migration-seeded `legacy` rows carry the old globally-unique slugs, so
    // a flat /recipes/<slug> link resolves to exactly one recipe forever.
    const legacyUq = indexes.find((i) => i.config.name === 'recipe_slug_aliases_legacy_slug_uq');
    expect(legacyUq?.config.unique).toBe(true);
    expect(legacyUq?.config.where).toBeDefined();
  });
});

describe('uniqueSlug', () => {
  it('returns the base slug when it is free', async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const slug = await uniqueSlug(fakeTx(findFirst), OWNER, 'apple-pie');
    expect(slug).toBe('apple-pie');
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('derives a distinct slug when the base is already taken', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: 'existing' }) // base taken
      .mockResolvedValueOnce(undefined); // perturbed candidate is free
    const slug = await uniqueSlug(fakeTx(findFirst), OWNER, 'apple-pie');
    expect(slug).not.toBe('apple-pie');
    expect(slug.startsWith('apple-pie-')).toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('treats a retained alias as occupied', async () => {
    // No live recipe holds it, but an old link points at it. Handing the slug to
    // a different recipe would silently redirect that link to other content.
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const findAlias = vi
      .fn()
      .mockResolvedValueOnce({ id: 'alias_1' })
      .mockResolvedValueOnce(undefined);
    const slug = await uniqueSlug(fakeTx(findFirst, findAlias), OWNER, 'apple-pie');
    expect(slug).not.toBe('apple-pie');
    expect(slug.startsWith('apple-pie-')).toBe(true);
  });

  it('excludes the given id so a recipe never collides with itself', async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const slug = await uniqueSlug(fakeTx(findFirst), OWNER, 'apple-pie', 'self_id');
    expect(slug).toBe('apple-pie');
  });

  it('treats a co-created recipe as occupying the namespace (#668)', async () => {
    // John already answers on `apple-pie` for someone *else's* recipe he
    // co-creates. His own new recipe must perturb around it, or his namespace
    // would resolve one slug to two different documents.
    const findCreator = vi
      .fn()
      .mockResolvedValueOnce({ id: 'creator_1' })
      .mockResolvedValueOnce(undefined);
    const slug = await uniqueSlug(
      fakeTx(vi.fn().mockResolvedValue(undefined), undefined, findCreator),
      OWNER,
      'apple-pie',
    );
    expect(slug).not.toBe('apple-pie');
    expect(slug.startsWith('apple-pie-')).toBe(true);
  });

  it('takes a per-namespace advisory lock before probing (#668)', async () => {
    // Three tables now share a namespace, each with its own unique constraint,
    // and Postgres has no cross-table unique. Without serializing on the
    // namespace, a creator-accept and a recipe-create can both probe a
    // candidate as free and both commit it, in different tables, with no
    // constraint violated and so no retry. The lock closes that window, and it
    // is taken here (not at each call site) so no caller can forget it.
    const calls: string[] = [];
    const execute = vi.fn().mockImplementation(() => {
      calls.push('lock');
      return Promise.resolve(undefined);
    });
    const findFirst = vi.fn().mockImplementation(() => {
      calls.push('probe');
      return Promise.resolve(undefined);
    });
    await uniqueSlug(fakeTx(findFirst, undefined, undefined, execute), OWNER, 'apple-pie');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(calls[0]).toBe('lock');
  });

  it('does not lock for a reserved base it rejects without a probe', async () => {
    // The reserved-slug rejection short-circuits before any DB work, so it must
    // not serialize the namespace either.
    const execute = vi.fn().mockResolvedValue(undefined);
    const findFirst = vi.fn().mockResolvedValue(undefined);
    await uniqueSlug(fakeTx(findFirst, undefined, undefined, execute), OWNER, 'new');
    // One lock for the single perturbed candidate that *is* probed, not two.
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("perturbs a reserved base so it can't shadow a sibling route", async () => {
    // "new" is free in the DB, but `/recipes/new` is the editor route. A recipe
    // slugged "new" would be unreachable at its legacy flat URL, so uniqueSlug
    // must never return it (regression: recipes "failing to resolve" after
    // create).
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const slug = await uniqueSlug(fakeTx(findFirst), OWNER, 'new');
    expect(slug).not.toBe('new');
    expect(slug.startsWith('new-')).toBe(true);
    expect(isReservedRecipeSlug(slug)).toBe(false);
    // The reserved base is rejected without a DB round-trip. Only the perturbed
    // candidate is checked for existence.
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('isSlugConflict', () => {
  it('matches a unique-violation on the slug constraint', () => {
    expect(isSlugConflict(slugConflict())).toBe(true);
  });

  it('matches when only the message carries the constraint name', () => {
    expect(
      isSlugConflict({
        code: '23505',
        message: 'violates unique constraint "recipes_author_slug_uq"',
      }),
    ).toBe(true);
  });

  it('matches a collision on the alias table', () => {
    // Retiring a slug races the same way claiming one does, and an alias counts
    // as occupied, so both constraints must trigger the retry.
    expect(isSlugConflict(aliasConflict())).toBe(true);
    expect(
      isSlugConflict({
        code: '23505',
        message: 'violates unique constraint "recipe_slug_aliases_owner_slug_uq"',
      }),
    ).toBe(true);
  });

  it('matches a collision on the co-creator namespace constraint (#668)', () => {
    // A creator's namespace slug races the same way an owner's does, and the
    // three tables share one namespace, so this constraint must trigger the
    // retry too — otherwise accepting an invite fails hard on a lost race.
    expect(isSlugConflict(creatorSlugConflict())).toBe(true);
    expect(
      isSlugConflict({
        code: '23505',
        message: 'violates unique constraint "recipe_creators_user_slug_uq"',
      }),
    ).toBe(true);
  });

  it('unwraps a single cause level', () => {
    expect(isSlugConflict({ cause: slugConflict() })).toBe(true);
  });

  it('ignores unique violations on other constraints', () => {
    expect(isSlugConflict({ code: '23505', constraint: 'ratings_recipe_user_uq' })).toBe(false);
  });

  it('ignores non-unique-violation errors and non-objects', () => {
    expect(isSlugConflict({ code: '23503' })).toBe(false); // fk violation
    expect(isSlugConflict(new Error('boom'))).toBe(false);
    expect(isSlugConflict(null)).toBe(false);
    expect(isSlugConflict('nope')).toBe(false);
  });
});

describe('createRecipe slug-conflict resilience', () => {
  it('retries the whole transaction on a slug collision, then succeeds', async () => {
    const created = { id: 'r1', slug: 'apple-pie-2' };
    dbMock.transaction.mockRejectedValueOnce(slugConflict()).mockResolvedValueOnce(created);

    const result = await createRecipe(input, author);

    expect(result).toEqual(created);
    expect(dbMock.transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry on an unrelated error', async () => {
    dbMock.transaction.mockRejectedValueOnce(new Error('boom'));

    await expect(createRecipe(input, author)).rejects.toThrow('boom');
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
  });

  it('gives up after the max attempts if the collision never clears', async () => {
    dbMock.transaction.mockRejectedValue(slugConflict());

    await expect(createRecipe(input, author)).rejects.toMatchObject({
      code: '23505',
    });
    expect(dbMock.transaction).toHaveBeenCalledTimes(5);
  });
});

describe('forkRecipe slug-conflict resilience', () => {
  it('retries the whole transaction on a slug collision, then succeeds', async () => {
    const created = { id: 'f1', slug: 'apple-pie-adaptation-2' };
    dbMock.transaction.mockRejectedValueOnce(slugConflict()).mockResolvedValueOnce(created);

    const result = await forkRecipe('apple-pie', author);

    expect(result).toEqual(created);
    expect(dbMock.transaction).toHaveBeenCalledTimes(2);
  });
});

describe('updateRecipe slug-conflict resilience', () => {
  it('retries the whole transaction on a slug collision, then succeeds', async () => {
    // A rename now re-slugs (issue #666), so an edit can lose the same
    // check-then-write race a create can. It must retry rather than surface a
    // raw Postgres error to someone who just renamed their recipe.
    const updated = { id: 'r1', slug: 'sunday-ragu' };
    dbMock.transaction.mockRejectedValueOnce(slugConflict()).mockResolvedValueOnce(updated);

    const result = await updateRecipe('r1', input, author);

    expect(result).toEqual(updated);
    expect(dbMock.transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry on an unrelated error', async () => {
    dbMock.transaction.mockRejectedValueOnce(new Error('boom'));

    await expect(updateRecipe('r1', input, author)).rejects.toThrow('boom');
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('revertRecipe slug-conflict resilience', () => {
  it('retries the whole transaction on a slug collision, then succeeds', async () => {
    // A revert restores the snapshot's title, which re-slugs just like a rename.
    const reverted = { id: 'r1', slug: 'nonnas-ragu' };
    dbMock.transaction.mockRejectedValueOnce(slugConflict()).mockResolvedValueOnce(reverted);

    const result = await revertRecipe('r1', 2, author);

    expect(result).toEqual(reverted);
    expect(dbMock.transaction).toHaveBeenCalledTimes(2);
  });
});

// --- Group-membership enforcement (issue #180. IDOR on groupId) -------------

/** A tx stand-in exposing just the `group_members` lookup `resolveGroupId` does. */
function membershipTx(member: { id: string } | undefined) {
  const findFirst = vi.fn().mockResolvedValue(member);
  const tx = {
    query: { groupMembers: { findFirst } },
  } as unknown as Parameters<typeof resolveGroupId>[0];
  return { tx, findFirst };
}

describe('resolveGroupId (group-membership guard)', () => {
  it('keeps a groupId the author is a member of', async () => {
    const { tx, findFirst } = membershipTx({ id: 'gm_1' });
    const parsed = recipeInput.parse({
      title: 'Apple Pie',
      visibility: 'group',
      groupId: 'grp_1',
    });

    await expect(resolveGroupId(tx, parsed, author)).resolves.toBe('grp_1');
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects a group-visibility recipe assigned to a group the author isn't in", async () => {
    const { tx } = membershipTx(undefined);
    const parsed = recipeInput.parse({
      title: 'Apple Pie',
      visibility: 'group',
      groupId: 'grp_x',
    });

    await expect(resolveGroupId(tx, parsed, author)).rejects.toThrow('FORBIDDEN');
  });

  it("nulls a stray groupId on a non-group recipe when the author isn't a member", async () => {
    const { tx } = membershipTx(undefined);
    const parsed = recipeInput.parse({
      title: 'Apple Pie',
      visibility: 'private',
      groupId: 'grp_x',
    });

    await expect(resolveGroupId(tx, parsed, author)).resolves.toBeNull();
  });

  it('keeps a groupId a member attaches to a non-group recipe', async () => {
    const { tx } = membershipTx({ id: 'gm_1' });
    const parsed = recipeInput.parse({
      title: 'Apple Pie',
      visibility: 'private',
      groupId: 'grp_1',
    });

    await expect(resolveGroupId(tx, parsed, author)).resolves.toBe('grp_1');
  });

  it('returns null without a membership lookup when no groupId is set', async () => {
    const { tx, findFirst } = membershipTx({ id: 'gm_1' });
    const parsed = recipeInput.parse({ title: 'Apple Pie' });

    await expect(resolveGroupId(tx, parsed, author)).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

/**
 * A resolved-then-chainable stand-in: `await tx.insert(t).values(v)` resolves,
 * while `tx.insert(t).values(v).returning(...)` / `.onConflictDoNothing()` also
 * work. Matching the fluent drizzle surface the mutation code walks.
 */
function chainable(result: unknown) {
  return {
    returning: vi.fn(() => Promise.resolve(result)),
    onConflictDoNothing: vi.fn(() => Promise.resolve(undefined)),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
}

/** Like {@link chainable} but the awaited insert rejects. Models a DB error. */
function rejecting(err: Error) {
  return {
    returning: vi.fn(() => Promise.reject(err)),
    onConflictDoNothing: vi.fn(() => Promise.reject(err)),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.reject(err).then(onFulfilled, onRejected),
  };
}

/** Fake tx that drives a full `createRecipe` transaction without a database. */
function createTx(opts: { member: boolean }) {
  const recipeValues = vi.fn();
  const insert = vi.fn((table: unknown) => ({
    values: (vals: unknown) => {
      if (table === recipes) recipeValues(vals);
      return chainable(table === recipes ? [{ id: 'r1', slug: 'apple-pie' }] : undefined);
    },
  }));
  const tx: Record<string, unknown> = {
    query: {
      groupMembers: {
        findFirst: vi.fn().mockResolvedValue(opts.member ? { id: 'gm_1' } : undefined),
      },
      recipes: { findFirst: vi.fn().mockResolvedValue(undefined) },
      recipeSlugAliases: { findFirst: vi.fn().mockResolvedValue(undefined) },
      recipeCreators: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
    // Slug allocation serializes on the author's namespace (issue #668).
    execute: vi.fn().mockResolvedValue(undefined),
    insert,
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ next: 1 }])),
      })),
    })),
  };
  // journal() allocates the version number inside a SAVEPOINT (tx.transaction).
  // run the callback against the same fake surface so a create writes one version.
  tx.transaction = (cb: (t: unknown) => unknown) => cb(tx);
  return { tx, insert, recipeValues };
}

describe('createRecipe group-membership enforcement', () => {
  it('persists a groupId the author belongs to', async () => {
    const { tx, recipeValues } = createTx({ member: true });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const parsed = recipeInput.parse({
      title: 'Apple Pie',
      visibility: 'group',
      groupId: 'grp_1',
    });

    const result = await createRecipe(parsed, author);

    expect(result).toEqual({ id: 'r1', slug: 'apple-pie' });
    expect(recipeValues).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'grp_1', visibility: 'group' }),
    );
  });

  it("rejects (FORBIDDEN) and persists nothing when the author isn't a member", async () => {
    const { tx, insert } = createTx({ member: false });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const parsed = recipeInput.parse({
      title: 'Apple Pie',
      visibility: 'group',
      groupId: 'grp_x',
    });

    await expect(createRecipe(parsed, author)).rejects.toThrow('FORBIDDEN');
    expect(insert).not.toHaveBeenCalled();
  });

  it('nulls a stray groupId on a private recipe from a non-member', async () => {
    const { tx, recipeValues } = createTx({ member: false });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const parsed = recipeInput.parse({
      title: 'Apple Pie',
      visibility: 'private',
      groupId: 'grp_x',
    });

    await createRecipe(parsed, author);

    expect(recipeValues).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: null, visibility: 'private' }),
    );
  });
});

/**
 * Fake tx that drives a full `updateRecipe` transaction without a database.
 *
 * `ownerId` and `creator` exist so the same harness can drive a co-creator's
 * edit (#668): the recipe is owned by someone else and `recipe_creators` is
 * asked whether the actor is an accepted creator of it.
 */
function updateTx(opts: {
  member: boolean;
  ownerId?: string;
  creator?: boolean;
  visibility?: string;
  groupId?: string | null;
}) {
  const setValues = vi.fn();
  const update = vi.fn(() => ({
    set: (vals: unknown) => {
      setValues(vals);
      return { where: vi.fn(() => Promise.resolve(undefined)) };
    },
  }));
  const aliasValues = vi.fn();
  const tx: Record<string, unknown> = {
    query: {
      groupMembers: {
        findFirst: vi.fn().mockResolvedValue(opts.member ? { id: 'gm_1' } : undefined),
      },
      recipes: {
        // First call is `updateRecipe`'s own lookup; later calls are
        // `slugTaken`'s occupancy probe, which the real query excludes this
        // recipe from via `ne(recipes.id, ignoreRecipeId)`. The fake can't
        // express that predicate, so it answers "free" after the first call.
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'r1',
            slug: 'apple-pie',
            title: 'Apple Pie',
            publishedAt: null,
            status: 'draft',
            visibility: opts.visibility ?? 'private',
            groupId: opts.groupId ?? null,
            authorId: opts.ownerId ?? author.id,
            author: { slug: 'owner-cook' },
          })
          .mockResolvedValue(undefined),
      },
      recipeSlugAliases: { findFirst: vi.fn().mockResolvedValue(undefined) },
      recipeCreators: {
        // First call is the edit-access check; later calls are `slugTaken`'s
        // co-creator occupancy probe, which likewise excludes this recipe.
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(opts.creator ? { id: 'rc_1' } : undefined)
          .mockResolvedValue(undefined),
      },
    },
    // Slug allocation serializes on the namespace before probing (issue #668).
    execute: vi.fn().mockResolvedValue(undefined),
    update,
    insert: vi.fn((table: unknown) => ({
      values: (vals: unknown) => {
        if (table === recipeSlugAliases) aliasValues(vals);
        return chainable(undefined);
      },
    })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ next: 1 }])),
      })),
    })),
  };
  // journal() allocates the version number inside a SAVEPOINT (tx.transaction).
  // run the callback against the same fake surface so an update writes one version.
  tx.transaction = (cb: (t: unknown) => unknown) => cb(tx);
  return { tx, update, setValues, aliasValues };
}

describe('updateRecipe group-membership enforcement', () => {
  it('allows an update assigning a group the author belongs to', async () => {
    const { tx, setValues } = updateTx({ member: true });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const parsed = recipeInput.parse({
      title: 'Apple Pie',
      visibility: 'group',
      groupId: 'grp_1',
    });

    const result = await updateRecipe('r1', parsed, author);

    expect(result).toEqual({ id: 'r1', slug: 'apple-pie', cook: 'owner-cook' });
    expect(setValues).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'grp_1' }));
  });

  it("rejects (FORBIDDEN) an update assigning a group the author isn't in", async () => {
    const { tx, update } = updateTx({ member: false });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const parsed = recipeInput.parse({
      title: 'Apple Pie',
      visibility: 'group',
      groupId: 'grp_x',
    });

    await expect(updateRecipe('r1', parsed, author)).rejects.toThrow('FORBIDDEN');
    expect(update).not.toHaveBeenCalled();
  });
});

// --- Version-number allocation race (issue #151) -----------------------------

/**
 * A fake `updateRecipe` tx whose version-history INSERT collides on the
 * `recipe_versions_recipe_version_uq` constraint the first time (a lost race
 * with a concurrent edit) and succeeds the second time. `select max+1` returns
 * an increasing value across attempts, modelling the sibling's now-committed row.
 */
function versionRaceTx() {
  const nextValues = [2, 3];
  const versionRows: Array<{ versionNumber: number }> = [];
  let conflictPending = true;
  const insert = vi.fn((table: unknown) => ({
    values: (vals: unknown) => {
      if (table !== recipeVersions) return chainable(undefined);
      versionRows.push(vals as { versionNumber: number });
      if (conflictPending) {
        conflictPending = false;
        return rejecting(versionConflict());
      }
      return chainable(undefined);
    },
  }));
  const tx: Record<string, unknown> = {
    query: {
      groupMembers: { findFirst: vi.fn().mockResolvedValue({ id: 'gm_1' }) },
      recipes: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'r1',
          slug: 'apple-pie',
          title: 'Apple Pie',
          publishedAt: null,
          status: 'draft',
          visibility: 'private',
          groupId: null,
          authorId: 'user_1',
          author: { slug: 'owner-cook' },
        }),
      },
      recipeSlugAliases: { findFirst: vi.fn().mockResolvedValue(undefined) },
      recipeCreators: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
    update: vi.fn(() => ({
      set: () => ({ where: vi.fn(() => Promise.resolve(undefined)) }),
    })),
    insert,
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ next: nextValues.shift() ?? 99 }])),
      })),
    })),
  };
  tx.transaction = (cb: (t: unknown) => unknown) => cb(tx);
  return { tx, versionRows };
}

describe('journal version-number allocation (issue #151)', () => {
  it('flags a version-number unique-violation for retry', () => {
    expect(isVersionConflict(versionConflict())).toBe(true);
    expect(isVersionConflict(slugConflict())).toBe(false);
    expect(isVersionConflict(new Error('nope'))).toBe(false);
  });

  it('retries on a version-number collision so concurrent edits get distinct numbers', async () => {
    const { tx, versionRows } = versionRaceTx();
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await updateRecipe('r1', recipeInput.parse({ title: 'Apple Pie' }), author);

    // First attempt took v2 and lost the race. The retry recomputed max+1 → v3.
    expect(versionRows.map((r) => r.versionNumber)).toEqual([2, 3]);
  });
});

// --- Cross-tenant ownership regression guards (issue #220) --------------------

/**
 * Negative-authorization guards: `revertRecipe`/`deleteRecipe` scope every write
 * by `authorId`, so another user's recipe is invisible to the mutation and
 * resolves to `NOT_FOUND` rather than being edited. `updateRecipe` now admits
 * accepted co-creators too (#668), so it is guarded one layer in — the recipe is
 * found, but a caller who is neither owner nor accepted creator is rejected.
 */
const stranger = { id: 'stranger_9' } as User;

/** Tx whose author-scoped recipe lookup finds nothing (a non-owner caller). */
function notOwnedTx() {
  const update = vi.fn(() => ({
    set: () => ({ where: vi.fn(() => Promise.resolve(undefined)) }),
  }));
  const tx: Record<string, unknown> = {
    query: {
      recipes: { findFirst: vi.fn().mockResolvedValue(undefined) },
      recipeVersions: { findFirst: vi.fn().mockResolvedValue(undefined) },
      recipeCreators: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
    update,
    insert: vi.fn(() => ({ values: () => chainable(undefined) })),
  };
  tx.transaction = (cb: (t: unknown) => unknown) => cb(tx);
  return { tx, update };
}

describe('recipe ownership authz guards (i220)', () => {
  it('updateRecipe by a stranger who holds no creator row throws NOT_FOUND and writes nothing', async () => {
    // The recipe is found — the ownership check is no longer in the WHERE
    // clause — so this asserts the `assertRecipeEditAccess` gate itself (#668).
    const { tx, update } = updateTx({
      member: true,
      ownerId: 'user_1',
      creator: false,
    });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await expect(
      updateRecipe('r1', recipeInput.parse({ title: 'Apple Pie' }), stranger),
    ).rejects.toThrow('NOT_FOUND');
    expect(update).not.toHaveBeenCalled();
  });

  it('updateRecipe on a missing recipe throws NOT_FOUND and writes nothing', async () => {
    const { tx, update } = notOwnedTx();
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await expect(
      updateRecipe('r1', recipeInput.parse({ title: 'Apple Pie' }), stranger),
    ).rejects.toThrow('NOT_FOUND');
    expect(update).not.toHaveBeenCalled();
  });

  it("revertRecipe on another user's recipe throws NOT_FOUND and writes nothing", async () => {
    const { tx, update } = notOwnedTx();
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await expect(revertRecipe('r1', 1, stranger)).rejects.toThrow('NOT_FOUND');
    expect(update).not.toHaveBeenCalled();
  });

  it("deleteRecipe on another user's recipe throws NOT_FOUND (no row matched)", async () => {
    // deleteRecipe first runs an owner-scoped lookup for the kid-safe guard
    // (issue #367): a non-owner sees no row, so the guard is skipped. It then
    // issues db.update(...).where(id AND authorId AND deleted IS NULL). A
    // non-owner matches no row, so `.returning()` is empty → NOT_FOUND.
    (dbMock as Record<string, unknown>).query = {
      recipes: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const where = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) }));
    const set = vi.fn(() => ({ where }));
    (dbMock as Record<string, unknown>).update = vi.fn(() => ({ set }));

    await expect(deleteRecipe('r1', stranger)).rejects.toThrow('NOT_FOUND');
  });
});

// --- Co-creator edit rights (issue #668) -------------------------------------

/**
 * An accepted co-creator may rewrite a recipe's body, but the recipe stays the
 * owner's: their namespace allocates the slug, and the distribution fields
 * (visibility, publication state, group) are pinned to what the owner set.
 *
 * These are the tests that fail if the actor is ever conflated with the
 * namespace owner again, which would move a URL out from under its cook.
 */
const coCreator = { id: 'creator_2' } as User;

describe('co-creator edit rights (i668)', () => {
  it('lets an accepted co-creator save a body edit', async () => {
    const { tx, setValues } = updateTx({
      member: false,
      ownerId: 'user_1',
      creator: true,
    });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    const result = await updateRecipe(
      'r1',
      recipeInput.parse({ title: 'Apple Pie', notes: 'Chill the dough.' }),
      coCreator,
    );

    expect(result).toEqual({ id: 'r1', slug: 'apple-pie', cook: 'owner-cook' });
    expect(setValues).toHaveBeenCalledWith(expect.objectContaining({ notes: 'Chill the dough.' }));
  });

  it('journals the version against the co-creator, not the owner', async () => {
    const { tx } = updateTx({
      member: false,
      ownerId: 'user_1',
      creator: true,
    });
    const versionRows: Array<{ authorId: string }> = [];
    tx.insert = vi.fn((table: unknown) => ({
      values: (vals: unknown) => {
        if (table === recipeVersions) versionRows.push(vals as { authorId: string });
        return chainable(undefined);
      },
    }));
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await updateRecipe('r1', recipeInput.parse({ title: 'Apple Pie' }), coCreator);

    expect(versionRows.map((r) => r.authorId)).toEqual(['creator_2']);
  });

  it("pins visibility and status to the owner's values on a co-creator save", async () => {
    const { tx, setValues } = updateTx({
      member: true,
      ownerId: 'user_1',
      creator: true,
      visibility: 'private',
      groupId: 'grp_owner',
    });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await updateRecipe(
      'r1',
      recipeInput.parse({
        title: 'Apple Pie',
        // A co-creator attempting to publish someone's private recipe to the
        // open web. Escalating an edit grant into an access-control change.
        visibility: 'public',
        status: 'published',
        groupId: 'grp_attacker',
      }),
      coCreator,
    );

    expect(setValues).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: 'private',
        status: 'draft',
        groupId: 'grp_owner',
      }),
    );
  });

  it("re-slugs a co-creator's rename inside the OWNER's namespace", async () => {
    const { tx, setValues, aliasValues } = updateTx({
      member: false,
      ownerId: 'user_1',
      creator: true,
    });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await updateRecipe('r1', recipeInput.parse({ title: 'Sunday Pie' }), coCreator);

    expect(setValues).toHaveBeenCalledWith(expect.objectContaining({ slug: 'sunday-pie' }));
    // The retired slug is retained in the owner's namespace. Never the editor's,
    // which would plant an alias for someone else's recipe under their cook URL.
    expect(aliasValues).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user_1',
        recipeId: 'r1',
        slug: 'apple-pie',
      }),
    );
  });

  it('refuses a save from a pending (not yet accepted) invitee', async () => {
    // `updateTx({ creator: false })` models the `status = 'accepted'` filter
    // finding nothing, which is exactly what a pending row looks like to it.
    const { tx, update } = updateTx({
      member: false,
      ownerId: 'user_1',
      creator: false,
    });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await expect(
      updateRecipe('r1', recipeInput.parse({ title: 'Apple Pie' }), coCreator),
    ).rejects.toThrow('NOT_FOUND');
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps revertRecipe owner-only even for an accepted co-creator', async () => {
    // `revertRecipe` still scopes its lookup by `authorId`, so a co-creator's
    // call finds no row at all and never reaches a creator check.
    const { tx, update } = notOwnedTx();
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await expect(revertRecipe('r1', 1, coCreator)).rejects.toThrow('NOT_FOUND');
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps deleteRecipe owner-only even for an accepted co-creator', async () => {
    (dbMock as Record<string, unknown>).query = {
      recipes: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const where = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) }));
    const set = vi.fn(() => ({ where }));
    (dbMock as Record<string, unknown>).update = vi.fn(() => ({ set }));

    await expect(deleteRecipe('r1', coCreator)).rejects.toThrow('NOT_FOUND');
  });
});
