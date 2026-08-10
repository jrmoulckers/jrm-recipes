import 'server-only';

import { createId } from '@paralleldrive/cuid2';
import { and, eq, ne } from 'drizzle-orm';

import { db } from '~/server/db';
import { users, userSlugAliases } from '~/server/db/schema';
import {
  isReservedUserSlug,
  isValidUserSlug,
  opaqueUserSlug,
  userSlugBase,
  USER_SLUG_MAX_LENGTH,
} from '~/lib/user-slug';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Either a transaction or the root client; both expose the queries we need. */
type Db = Tx | typeof db;

/** DB-level unique constraint guarding `users.slug` (see schema/users.ts). */
export const USERS_SLUG_CONSTRAINT = 'users_slug_unique';

/** DB-level primary key on `user_slug_aliases.slug`. */
export const USER_SLUG_ALIAS_CONSTRAINT = 'user_slug_aliases_pkey';

/** Max attempts for an allocation that races another writer for the same slug. */
const MAX_USER_SLUG_ATTEMPTS = 5;

/** Postgres `unique_violation` SQLSTATE. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * True when `err` is a Postgres unique-violation on either structure that makes
 * a user slug unique: the live `users.slug` constraint or the alias table's
 * primary key. Both matter, because an alias counts as occupied.
 */
export function isUserSlugConflict(err: unknown): boolean {
  const e = err as {
    code?: string;
    constraint?: string;
    constraint_name?: string;
    message?: string;
    cause?: unknown;
  };
  if (e.code === PG_UNIQUE_VIOLATION) {
    const name = e.constraint ?? e.constraint_name;
    if (name === USERS_SLUG_CONSTRAINT || name === USER_SLUG_ALIAS_CONSTRAINT) return true;
    if (name == null && typeof e.message === 'string')
      return (
        e.message.includes(USERS_SLUG_CONSTRAINT) || e.message.includes(USER_SLUG_ALIAS_CONSTRAINT)
      );
    return false;
  }
  if (e.cause != null && e.cause !== err) return isUserSlugConflict(e.cause);
  return false;
}

/**
 * Run a write that may collide on a user slug, retrying the whole operation.
 * Each attempt is a fresh transaction, so the retry re-runs
 * {@link uniqueUserSlug} against newly-committed rows: the DB constraints, not
 * the app-side check, are the source of truth.
 */
export async function withUserSlugConflictRetry<T>(op: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (attempt < MAX_USER_SLUG_ATTEMPTS && isUserSlugConflict(err)) continue;
      throw err;
    }
  }
}

/**
 * Whether `slug` is already spoken for: held by a live user, retained as an
 * alias, or reserved for a static route.
 *
 * Aliases count as taken. That is the rule that keeps redirects honest: if a
 * released slug could be re-claimed by a different account, every old link
 * bearing it would start resolving to a stranger's recipes.
 */
async function slugTaken(tx: Db, candidate: string, ignoreUserId?: string): Promise<boolean> {
  if (isReservedUserSlug(candidate)) return true;

  const live = await tx.query.users.findFirst({
    where: ignoreUserId
      ? and(eq(users.slug, candidate), ne(users.id, ignoreUserId))
      : eq(users.slug, candidate),
    columns: { id: true },
  });
  if (live) return true;

  const alias = await tx.query.userSlugAliases.findFirst({
    where: ignoreUserId
      ? and(eq(userSlugAliases.slug, candidate), ne(userSlugAliases.userId, ignoreUserId))
      : eq(userSlugAliases.slug, candidate),
    columns: { slug: true },
  });
  return Boolean(alias);
}

/**
 * Best-effort in-transaction search for a free user slug derived from `base`.
 * Not authoritative: the DB constraints are, and
 * {@link withUserSlugConflictRetry} recovers from any race the check-then-write
 * here can still lose.
 *
 * `ignoreUserId` lets a user keep or reclaim a slug they already hold (or once
 * held), so re-saving an unchanged profile is a no-op rather than a collision.
 */
export async function uniqueUserSlug(tx: Db, base: string, ignoreUserId?: string): Promise<string> {
  const seed = base.slice(0, USER_SLUG_MAX_LENGTH - 8);
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    if (!(await slugTaken(tx, candidate, ignoreUserId))) return candidate;
    candidate = `${seed}-${(i + 2).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  }
  return `${seed}-${Date.now().toString(36)}`;
}

/**
 * The slug a brand-new account should start with: their Clerk handle, else
 * their display name, else an opaque `cook-…`. Collisions are resolved against
 * live slugs and the alias history.
 */
export async function allocateUserSlug(
  tx: Db,
  profile: { handle?: string | null; name?: string | null },
): Promise<string> {
  const base =
    (profile.handle ? userSlugBase(profile.handle) : null) ??
    (profile.name ? userSlugBase(profile.name) : null) ??
    opaqueUserSlug(createId().slice(0, 8));
  return uniqueUserSlug(tx, base);
}

/** Why a requested user slug was refused. */
export type UserSlugRejection = 'invalid' | 'taken';

/**
 * Change a user's slug to one they chose, retaining the old slug as a permanent
 * alias so every link ever shared to their recipes keeps resolving.
 *
 * Returns `{ ok: false }` rather than throwing for the two *expected* outcomes
 * (malformed and already-taken), so the caller can surface a field error. A
 * no-op rename (same slug) succeeds without writing an alias.
 */
export async function changeUserSlug(
  userId: string,
  requested: string,
): Promise<{ ok: true; slug: string } | { ok: false; reason: UserSlugRejection }> {
  const normalized = requested.trim().toLowerCase();
  if (!isValidUserSlug(normalized)) return { ok: false, reason: 'invalid' };

  try {
    return await withUserSlugConflictRetry(() =>
      db.transaction(async (tx) => {
        const current = await tx.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { slug: true },
        });
        if (!current) return { ok: false, reason: 'invalid' } as const;
        if (current.slug === normalized) return { ok: true, slug: current.slug } as const;

        if (await slugTaken(tx, normalized, userId)) return { ok: false, reason: 'taken' } as const;

        await tx.update(users).set({ slug: normalized }).where(eq(users.id, userId));

        // Retain the outgoing slug forever. `onConflictDoNothing` covers the
        // case where the user is re-taking a slug they previously released:
        // the alias row already points at them, so there is nothing to add.
        await tx
          .insert(userSlugAliases)
          .values({ slug: current.slug, userId })
          .onConflictDoNothing({ target: userSlugAliases.slug });

        // The slug just claimed must stop being an alias, or it would resolve
        // as both a live slug and a redirect source.
        await tx.delete(userSlugAliases).where(eq(userSlugAliases.slug, normalized));

        return { ok: true, slug: normalized } as const;
      }),
    );
  } catch (err) {
    if (isUserSlugConflict(err)) return { ok: false, reason: 'taken' };
    throw err;
  }
}

/**
 * Slug rotation on deletion was removed in issue #678.
 *
 * `anonymizeUserSlug` used to rotate a deleted account's slug to an opaque
 * `cook-…` and keep the recipes reachable under it. That approach was rejected:
 * account deletion is now full erasure, so the `users` row, its slug and all its
 * aliases are deleted outright and those URLs 404. Nothing is left to rotate.
 * See `~/server/users/erasure`.
 */

/**
 * Resolve a URL segment to a user: the live slug first, then the retained
 * aliases. `redirect` is true when the segment came from an alias, which the
 * route turns into a 308 to the canonical path.
 */
export async function resolveUserSlug(
  segment: string,
): Promise<{ userId: string; slug: string; redirect: boolean } | null> {
  const normalized = segment.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > USER_SLUG_MAX_LENGTH) return null;

  const live = await db.query.users.findFirst({
    where: eq(users.slug, normalized),
    columns: { id: true, slug: true },
  });
  if (live) return { userId: live.id, slug: live.slug, redirect: false };

  const alias = await db.query.userSlugAliases.findFirst({
    where: eq(userSlugAliases.slug, normalized),
    columns: { userId: true },
    with: { user: { columns: { slug: true } } },
  });
  if (!alias?.user) return null;
  return { userId: alias.userId, slug: alias.user.slug, redirect: true };
}
