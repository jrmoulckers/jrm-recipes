import { type User } from "~/server/db/schema";

/**
 * The stable local user used when auth isn't configured (dev-bypass) and by the
 * seed script. Kept in its own module (no "server-only") so tooling/scripts can
 * import it without pulling in the Clerk-aware auth module.
 */
export const DEV_USER: User = {
  id: "dev_local_user_00000000",
  clerkId: null,
  email: "cook@heirloom.local",
  name: "Home Cook",
  handle: "home-cook",
  slug: "home-cook",
  avatarUrl: null,
  avatarUserManaged: false,
  weeklyDigestOptIn: false,
  publicActivityOptIn: false,
  deletedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

/**
 * A second local identity, so tests can be two different people (issue #698).
 *
 * Co-creation is defined by the *difference* between two viewers — an owner
 * sees the management panel, an invitee sees nothing until they accept — and a
 * harness with one identity cannot express that at all.
 *
 * This is the seed's `Aunt Rosa` rather than a new fixture: the seed already
 * creates a cook with a distinct `users.slug`, and inventing a parallel one
 * would be a second source of truth for the same row. `seed.ts` imports this
 * constant so the two cannot drift.
 */
export const DEV_CO_COOK: User = {
  ...DEV_USER,
  id: "seed_usr_rosa",
  email: "rosa@heirloom.local",
  name: "Aunt Rosa",
  handle: "aunt-rosa",
  slug: "aunt-rosa",
};

/**
 * Every identity the dev bypass may serve, as a closed allowlist.
 *
 * The allowlist *is* the security boundary. A selector that looked up an
 * arbitrary `users.id` would be an impersonation primitive — "become anyone" —
 * and its blast radius would be whatever the bypass's own guard failed to
 * catch. Selecting from a fixed array means the worst an attacker-supplied
 * value can achieve is one of two accounts that only exist locally, and an
 * unknown value resolves to the default rather than erroring.
 */
export const DEV_IDENTITIES: readonly User[] = [DEV_USER, DEV_CO_COOK];

/** Cookie a test sets to choose which dev identity a browser context is. */
export const DEV_IDENTITY_COOKIE = "heirloom_dev_identity";

/**
 * Resolve a requested dev identity, defaulting to {@link DEV_USER}.
 *
 * Total by construction: every input maps to a real allowlisted identity, so a
 * caller can never end up with a half-resolved or attacker-shaped user. This is
 * only ever reached from the dev-bypass branch, which `assertDevBypassAllowed`
 * has already refused to enter in production.
 */
export function resolveDevIdentity(requested: string | undefined | null): User {
  if (!requested) return DEV_USER;
  return DEV_IDENTITIES.find((identity) => identity.id === requested) ?? DEV_USER;
}
