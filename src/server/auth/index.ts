import "server-only";

import { eq } from "drizzle-orm";

import { env } from "~/env";
import { db, isDbConfigured } from "~/server/db";
import { users, type User } from "~/server/db/schema";

/**
 * Heirloom auth module.
 *
 * All auth flows through here so the rest of the app never imports Clerk
 * directly. When Clerk isn't configured (or NEXT_PUBLIC_DEV_AUTH_BYPASS=1) we
 * fall back to a stable local "dev" user, so the app + tests run with no keys.
 */

export const DEV_USER: User = {
  id: "dev_local_user_00000000",
  clerkId: null,
  email: "cook@heirloom.local",
  name: "Home Cook",
  handle: "home-cook",
  avatarUrl: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

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

  return (
    created ??
    (await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) })) ??
    null
  );
}

/** The current app user, or null if not signed in (never null in dev-bypass). */
export async function getCurrentUser(): Promise<User | null> {
  if (!isAuthConfigured()) {
    return getOrCreateDevUser();
  }
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) return null;
  return syncClerkUser(userId);
}

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
