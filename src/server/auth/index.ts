import 'server-only';

import { cache } from 'react';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { env } from '~/env';
import { db, isDbConfigured } from '~/server/db';
import { groupMembers, recipes, users, type User } from '~/server/db/schema';
import {
  DEV_USER,
  DEV_IDENTITY_COOKIE,
  isIdentitySelectorEnabled,
  resolveDevIdentity,
} from '~/server/auth/dev-user';
import { getEntitlements } from '~/server/billing/entitlements';
import type { Entitlements } from '~/config/plans';
import { isAnalyticsConfigured } from '~/lib/analytics/config';
import { buildIdentityTraits } from '~/lib/analytics/identity';
import { captureServer, identifyServer } from '~/lib/analytics/server';
import { allocateUserSlug } from '~/server/users/slug';
import { eraseUserAccount, type ErasureResult } from '~/server/users/erasure';

/**
 * Heirloom auth module.
 *
 * All auth flows through here so the rest of the app never imports Clerk
 * directly. When Clerk isn't configured (or NEXT_PUBLIC_DEV_AUTH_BYPASS=1) we
 * fall back to a stable local "dev" user, so the app + tests run with no keys.
 *
 * Security: dev-bypass is strictly a LOCAL/TEST affordance. `getCurrentUser`
 * calls `assertDevBypassAllowed` before ever returning the shared `DEV_USER`,
 * so production fails closed instead of silently serving every request as one
 * shared, fully-authenticated account. This backs up the boot/build guard in
 * `~/env`. `SKIP_ENV_VALIDATION` is the single escape hatch, used only by the
 * CI build + e2e run (which never serve real users).
 */

export { DEV_USER };

/**
 * Which dev identity this request is, per the selector cookie (issue #698).
 *
 * Called only from {@link getOrCreateDevUser}, i.e. strictly inside the branch
 * `assertDevBypassAllowed` has already refused to enter in production. That
 * placement is deliberate and is the whole security argument: the selector is
 * not a second way in, because it is unreachable everywhere the bypass itself
 * is. It cannot widen access, only choose among identities the bypass was
 * already willing to serve unconditionally.
 *
 * On top of that, the selector is **off unless `E2E_IDENTITY_SELECTOR=1`**
 * (issue #783). Deliberately not `NEXT_PUBLIC_`, so it cannot be set from a
 * client bundle and is never present on Vercel; CI sets it in the E2E job
 * alone. Read from `process.env` rather than `~/env.js` for the same reason
 * `assertDevBypassAllowed` reads `SKIP_ENV_VALIDATION` that way — it is a
 * test-harness switch, not product configuration, and adding it to the schema
 * would make it a documented deployment knob.
 *
 * Without the flag this returns {@link DEV_USER} *without reading the cookie
 * at all*, so the second identity is not merely unselected but unreachable.
 *
 * Reading a cookie costs nothing in render semantics here — the root layout
 * already calls `cookies()` for the theme and CSP nonce, so every route is
 * dynamic regardless (issue #193).
 *
 * Falls back to `DEV_USER` when there is no request scope at all, so a script
 * or a non-request caller behaves exactly as it did before this existed.
 */
async function selectDevIdentity(): Promise<User> {
  if (!isIdentitySelectorEnabled()) return DEV_USER;
  try {
    const { cookies } = await import('next/headers');
    const requested = (await cookies()).get(DEV_IDENTITY_COOKIE)?.value;
    return resolveDevIdentity(requested);
  } catch {
    return DEV_USER;
  }
}

/**
 * Fail closed: the shared dev-bypass user must never be served in production.
 * Reaching the dev fallback in prod always means auth is misconfigured (either
 * NEXT_PUBLIC_DEV_AUTH_BYPASS=1 or missing Clerk keys), so throw rather than
 * degrade. Parameterized for tests. Defaults read the live environment.
 */
export function assertDevBypassAllowed(
  nodeEnv: string = env.NODE_ENV,
  skipValidation = Boolean(process.env.SKIP_ENV_VALIDATION),
): void {
  if (skipValidation) return;
  if (nodeEnv === 'production') {
    throw new Error(
      'Refusing to serve the shared dev-bypass user in production. Configure ' +
        'Clerk (CLERK_SECRET_KEY + NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) and unset ' +
        'NEXT_PUBLIC_DEV_AUTH_BYPASS. Dev-bypass is a local/test-only affordance.',
    );
  }
}

/** True when real Clerk auth should be used. */
export function isAuthConfigured(): boolean {
  return (
    Boolean(env.CLERK_SECRET_KEY && env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== '1'
  );
}

export type AuthState = {
  isConfigured: boolean;
  isSignedIn: boolean;
  user: User | null;
};

async function getOrCreateDevUser(): Promise<User> {
  const identity = await selectDevIdentity();
  if (!isDbConfigured()) return identity;
  const existing = await db.query.users.findFirst({
    where: eq(users.id, identity.id),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({
      id: identity.id,
      email: identity.email,
      name: identity.name,
      handle: identity.handle,
      slug: identity.slug,
    })
    .onConflictDoNothing()
    .returning();
  return created ?? identity;
}

/** Fetch (and lazily sync) the app user for a signed-in Clerk account. */
async function syncClerkUser(clerkId: string): Promise<User | null> {
  if (!isDbConfigured()) return null;

  const existing = await db.query.users.findFirst({
    where: and(eq(users.clerkId, clerkId), isNull(users.deletedAt)),
  });
  if (existing) return existing;

  // First time we've seen this Clerk user. Pull their profile and store it.
  const { clerkClient } = await import('@clerk/nextjs/server');
  const client = await clerkClient();
  const profile = await client.users.getUser(clerkId);

  const email =
    profile.primaryEmailAddress?.emailAddress ?? profile.emailAddresses[0]?.emailAddress ?? null;
  const joinedName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const name = joinedName.length > 0 ? joinedName : (profile.username ?? 'Cook');

  const [created] = await db
    .insert(users)
    .values({
      clerkId,
      email,
      name,
      handle: profile.username ?? null,
      // The app-owned URL namespace (issue #666). Derived from the Clerk
      // handle, else the display name, else an opaque `cook-…`, and resolved
      // against live slugs and retained aliases so it is unique on arrival.
      slug: await allocateUserSlug(db, {
        handle: profile.username ?? null,
        name,
      }),
      avatarUrl: profile.imageUrl ?? null,
    })
    .onConflictDoNothing({ target: users.clerkId })
    .returning();

  // First time the app has seen this Clerk account. The sign-up funnel's
  // terminal step (#328). Guarded by the insert actually creating a row so a
  // race that hits onConflictDoNothing doesn't double-count. Attributed to the
  // internal user id (never PII) so it stitches to identify.
  if (created) {
    void captureServer(created.id, 'signup_completed', {});
  }

  return created ?? (await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) })) ?? null;
}

/**
 * Fire-and-forget server-side identify with non-PII person properties (#321).
 *
 * The distinct id is the internal `users.id`. Never the Clerk id, email, or
 * name. The attached traits are counts/flags only. It short-circuits with
 * zero DB work when analytics is unconfigured (the default), so it adds no
 * latency to the common path, and it swallows its own errors so identity is
 * always best-effort and never breaks auth.
 */
async function identifyUser(user: User): Promise<void> {
  if (!isAnalyticsConfigured() || !isDbConfigured()) return;
  try {
    const [groupCount, recipeCount] = await Promise.all([
      db.$count(groupMembers, eq(groupMembers.userId, user.id)),
      db.$count(recipes, eq(recipes.authorId, user.id)),
    ]);
    await identifyServer(
      user.id,
      buildIdentityTraits({
        createdAt: user.createdAt,
        groupCount,
        hasRecipes: recipeCount > 0,
        isDev: user.id === DEV_USER.id,
      }),
    );
  } catch {
    // Identity is best-effort. Never let it break an auth-gated request.
  }
}

/** Resolve the current app user without any analytics side effects. */
async function resolveCurrentUser(): Promise<User | null> {
  if (!isAuthConfigured()) {
    assertDevBypassAllowed();
    return getOrCreateDevUser();
  }
  const { auth } = await import('@clerk/nextjs/server');
  const { userId } = await auth();
  if (!userId) return null;
  return syncClerkUser(userId);
}

/**
 * The current app user, or null if not signed in (never null in dev-bypass).
 *
 * Wrapped in React `cache()` so the many callers within a single server render:
 * the root layout's `getAuthState`, each page's `load = cache(...)`,
 * `SiteHeader`, and the per-domain `queries.ts` that resolve the viewer. They all
 * collapse to one `auth()` resolution + one `users` lookup per request. Because
 * `getAuthState` and `requireUser` delegate here, they inherit the dedupe. The
 * memoization is request-scoped (module is `server-only`), so it never leaks a
 * viewer across requests, and the best-effort `identifyUser` side effect fires
 * at most once per request too.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const user = await resolveCurrentUser();
  if (user) void identifyUser(user);
  return user;
});

/** Full auth snapshot for UI (header, guards). */
export async function getAuthState(): Promise<AuthState> {
  const isConfigured = isAuthConfigured();
  const user = await getCurrentUser();
  return {
    isConfigured,
    isSignedIn: Boolean(user),
    user,
  };
}

/** Require a signed-in user or throw (use in server actions / protected data). */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHENTICATED');
  }
  return user;
}

/**
 * Convenience for premium-gated actions: the signed-in user plus their resolved
 * entitlements in one call, so an action can check a flag/limit without wiring
 * the billing resolver itself. Throws `UNAUTHENTICATED` when signed out.
 */
export async function requireUserWithEntitlements(): Promise<{
  user: User;
  entitlements: Entitlements;
}> {
  const user = await requireUser();
  const entitlements = await getEntitlements(user);
  return { user, entitlements };
}

/** The subset of a Clerk profile the local `users` row mirrors (issue #217). */
export type ClerkUserProfile = {
  email: string | null;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
};

/**
 * Apply a Clerk `user.updated` event (issue #217): keep the local `users` row's
 * email / name / handle / avatar in sync with the identity provider. This
 * matters because group invites are resolved by email/handle
 * ({@link findUserByIdentifier}), so a stale address could route an invite to
 * the wrong account. No-op when the DB is unconfigured or the Clerk user has no
 * local row yet (it'll be created lazily on their next authenticated read).
 *
 * The avatar is the one field Clerk does **not** always win (issue #659). Once
 * a user picks a photo inside Heirloom, `users.avatarUserManaged` is true and
 * this sync must leave `avatarUrl` alone — otherwise the very next Clerk
 * `user.updated` (a name change, an email verification, anything) would silently
 * revert their choice. The decision is made in SQL, inside the same UPDATE, so
 * there is no read-then-write window for a concurrent in-app upload to lose.
 */
export async function applyClerkUserUpdate(
  clerkId: string,
  profile: ClerkUserProfile,
): Promise<void> {
  if (!isDbConfigured() || !clerkId) return;
  await db
    .update(users)
    .set({
      email: profile.email,
      name: profile.name && profile.name.length > 0 ? profile.name : 'Cook',
      handle: profile.handle,
      avatarUrl: sql`case when ${users.avatarUserManaged} then ${users.avatarUrl} else ${profile.avatarUrl} end`,
    })
    .where(and(eq(users.clerkId, clerkId), isNull(users.deletedAt)));
}

/**
 * Apply a Clerk `user.deleted` event (issue #678, superseding #217).
 *
 * This used to soft-delete and anonymize: the row survived with a stable id and
 * every foreign key still pointing at it. That is pseudonymization, not
 * anonymization — the data remained personal data under GDPR Recital 26 — so
 * the erasure request went unremedied. It now performs a real erasure; see
 * `eraseUserAccount` for the policy and ordering.
 *
 * Idempotent in both directions: an event for an unknown `clerkId` is a no-op,
 * and a repeat event after a successful erasure is recognised via the hashed
 * tombstone, so Clerk's retries converge instead of redelivering forever.
 *
 * Returns the outcome rather than swallowing it, because since #694 an erasure
 * can be *held* instead of executed. A held request must not be reported as a
 * completed deletion, and must not be reported as a failure either: a 5xx would
 * make Clerk redeliver an event that can never succeed until a remedy ships.
 */
export async function applyClerkUserDeletion(
  clerkId: string,
): Promise<ErasureResult['status'] | 'unknown_subject'> {
  if (!isDbConfigured() || !clerkId) return 'unknown_subject';

  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!existing) return 'unknown_subject';

  const result = await eraseUserAccount(existing.id, {
    trigger: 'clerk_webhook',
  });
  return result.status;
}
