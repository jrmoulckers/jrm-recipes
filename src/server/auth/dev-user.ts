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
 * The name of the cookie an end-to-end spec sets to pick which seeded fixture
 * a browser context authenticates as (issue #698).
 *
 * Co-creation is defined entirely by two identities behaving differently — the
 * owner invites and manages, the invitee has no access until they accept — so
 * none of it is assertable while every browser context resolves to the one
 * shared {@link DEV_USER}. This cookie is the whole of the mechanism.
 *
 * It is read in exactly one place, `resolveCurrentUser` in `~/server/auth`, and
 * only after every existing production guard has already been satisfied. See
 * {@link E2E_IDENTITIES} for why it cannot become a second way in.
 */
export const E2E_IDENTITY_COOKIE = "heirloom_e2e_identity";

/**
 * The server-only environment flag that switches the selector on.
 *
 * Deliberately *not* `NEXT_PUBLIC_`-prefixed: it must never be inlined into a
 * client bundle, and it is not declared in `~/env`'s `runtimeEnv`, so it is
 * unreadable from the browser. It is set by `playwright.config.ts` and by CI's
 * `e2e` job, and by nothing else — never in any Vercel environment.
 */
export const E2E_IDENTITY_FLAG = "E2E_IDENTITY_SELECTOR";

/** The label a spec passes to select a fixture. */
export type E2EIdentityKey = "owner" | "cocreator";

/**
 * The closed set of identities the selector can ever resolve to (issue #698).
 *
 * This is the fourth and last of four independent barriers, any one of which is
 * on its own sufficient to make the selector inert on a real deploy:
 *
 * 1. **The branch is unreachable.** The selector lives inside
 *    `if (!isAuthConfigured())` in `resolveCurrentUser`. Production has Clerk
 *    keys and no bypass flag, so control goes to `syncClerkUser` and never
 *    reaches it. No call site is added anywhere else.
 * 2. **The existing fail-closed guard runs first.** `assertDevBypassAllowed`
 *    throws on `NODE_ENV=production` without `SKIP_ENV_VALIDATION`, and the
 *    selector is placed strictly after it, so it cannot run on any deploy that
 *    guard rejects. The build/boot guard in `~/env` is untouched.
 * 3. **Server-only opt-in.** Nothing is read unless {@link E2E_IDENTITY_FLAG}
 *    is exactly `"1"` in the server process environment.
 * 4. **A closed allowlist, of rows that do not exist.** The cookie selects a
 *    *key of this frozen map*. It can never name a `users.id`, `clerkId`,
 *    slug, or email, so it cannot be pointed at a real account even in
 *    principle. These fixtures are written only by `pnpm db:seed:e2e`, which
 *    only CI's `e2e` job runs, so the rows are absent from every dev, demo,
 *    preview and production database.
 *
 * The net change to the authentication surface is nil. Any caller who can reach
 * this map has already been served `DEV_USER` — a fully-authenticated shared
 * account — so choosing a different fixture grants nothing that was not already
 * granted. The selector cannot escalate; it can only pick among accounts an
 * attacker in that position already completely controls.
 */
export const E2E_IDENTITIES: Readonly<Record<E2EIdentityKey, User>> =
  Object.freeze({
    owner: {
      ...DEV_USER,
      id: "e2e_user_owner_000000000",
      email: "e2e-owner@heirloom.test",
      name: "Test Owner",
      handle: "e2e-owner",
      slug: "e2e-owner",
    },
    cocreator: {
      ...DEV_USER,
      id: "e2e_user_cocreator_00000",
      email: "e2e-cocreator@heirloom.test",
      name: "Test Co-creator",
      handle: "e2e-cocreator",
      slug: "e2e-cocreator",
    },
  });

/**
 * Resolve a raw cookie value to a fixture, or null.
 *
 * Pure and exported so the inertness argument above is unit-testable without a
 * request. Anything that is not exactly an allowlist key — an unknown label, a
 * real user id, a slug, an object, an empty string — resolves to null, and the
 * caller falls back to {@link DEV_USER}.
 */
export function resolveE2EIdentity(
  value: string | undefined | null,
  env: Record<string, string | undefined> = process.env,
): User | null {
  if (env[E2E_IDENTITY_FLAG] !== "1") return null;
  if (!value) return null;
  if (!Object.prototype.hasOwnProperty.call(E2E_IDENTITIES, value)) return null;
  return E2E_IDENTITIES[value as E2EIdentityKey];
}
