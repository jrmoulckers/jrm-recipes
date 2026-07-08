import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";

import { env } from "~/env";
import { db, isDbConfigured } from "~/server/db";
import {
  groupMembers,
  recipes,
  users,
  type User,
} from "~/server/db/schema";
import { DEV_USER } from "~/server/auth/dev-user";
import { isAnalyticsConfigured } from "~/lib/analytics/config";
import { buildIdentityTraits } from "~/lib/analytics/identity";
import { captureServer, identifyServer } from "~/lib/analytics/server";

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
 * `~/env`; `SKIP_ENV_VALIDATION` is the single escape hatch, used only by the
 * CI build + e2e run (which never serve real users).
 */

export { DEV_USER };

/**
 * Fail closed: the shared dev-bypass user must never be served in production.
 * Reaching the dev fallback in prod always means auth is misconfigured (either
 * NEXT_PUBLIC_DEV_AUTH_BYPASS=1 or missing Clerk keys), so throw rather than
 * degrade. Parameterized for tests; defaults read the live environment.
 */
export function assertDevBypassAllowed(
  nodeEnv: string = env.NODE_ENV,
  skipValidation = Boolean(process.env.SKIP_ENV_VALIDATION),
): void {
  if (skipValidation) return;
  if (nodeEnv === "production") {
    throw new Error(
      "Refusing to serve the shared dev-bypass user in production. Configure " +
        "Clerk (CLERK_SECRET_KEY + NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) and unset " +
        "NEXT_PUBLIC_DEV_AUTH_BYPASS. Dev-bypass is a local/test-only affordance.",
    );
  }
}

/** True when real Clerk auth should be used. */
export function isAuthConfigured(): boolean {
  return (
    Boolean(env.CLERK_SECRET_KEY && env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== "1"
  );
}

export type AuthState = {
  isConfigured: boolean;
  isSignedIn: boolean;
  user: User | null;
};

async function getOrCreateDevUser(): Promise<User> {
  if (!isDbConfigured()) return DEV_USER;
  const existing = await db.query.users.findFirst({
    where: eq(users.id, DEV_USER.id),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({
      id: DEV_USER.id,
      email: DEV_USER.email,
      name: DEV_USER.name,
      handle: DEV_USER.handle,
    })
    .onConflictDoNothing()
    .returning();
  return created ?? DEV_USER;
}

/** Fetch (and lazily sync) the app user for a signed-in Clerk account. */
async function syncClerkUser(clerkId: string): Promise<User | null> {
  if (!isDbConfigured()) return null;

  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });
  if (existing) return existing;

  // First time we've seen this Clerk user — pull their profile and store it.
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  const profile = await client.users.getUser(clerkId);

  const email =
    profile.primaryEmailAddress?.emailAddress ??
    profile.emailAddresses[0]?.emailAddress ??
    null;
  const joinedName = [profile.firstName, profile.lastName]
    .filter(Boolean)
    .join(" ");
  const name = joinedName.length > 0 ? joinedName : (profile.username ?? "Cook");

  const [created] = await db
    .insert(users)
    .values({
      clerkId,
      email,
      name,
      handle: profile.username ?? null,
      avatarUrl: profile.imageUrl ?? null,
    })
    .onConflictDoNothing({ target: users.clerkId })
    .returning();

  // First time the app has seen this Clerk account — the sign-up funnel's
  // terminal step (#328). Guarded by the insert actually creating a row so a
  // race that hits onConflictDoNothing doesn't double-count; attributed to the
  // internal user id (never PII) so it stitches to identify.
  if (created) {
    void captureServer(created.id, "signup_completed", {});
  }

  return (
    created ??
    (await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) })) ??
    null
  );
}

/**
 * Fire-and-forget server-side identify with non-PII person properties (#321).
 *
 * The distinct id is the internal `users.id` — never the Clerk id, email, or
 * name — and the attached traits are counts/flags only. It short-circuits with
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
    // Identity is best-effort; never let it break an auth-gated request.
  }
}

/** Resolve the current app user without any analytics side effects. */
async function resolveCurrentUser(): Promise<User | null> {
  if (!isAuthConfigured()) {
    assertDevBypassAllowed();
    return getOrCreateDevUser();
  }
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) return null;
  return syncClerkUser(userId);
}

/**
 * The current app user, or null if not signed in (never null in dev-bypass).
 *
 * Wrapped in React `cache()` so the many callers within a single server render
 * — the root layout's `getAuthState`, each page's `load = cache(...)`,
 * `SiteHeader`, and the per-domain `queries.ts` that resolve the viewer — all
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
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}
