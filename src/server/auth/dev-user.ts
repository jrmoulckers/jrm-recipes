import { type User } from '~/server/db/schema';

/**
 * The stable local user used when auth isn't configured (dev-bypass) and by the
 * seed script. Kept in its own module (no "server-only") so tooling/scripts can
 * import it without pulling in the Clerk-aware auth module.
 */
export const DEV_USER: User = {
  id: 'dev_local_user_00000000',
  clerkId: null,
  email: 'cook@heirloom.local',
  name: 'Home Cook',
  handle: 'home-cook',
  slug: 'home-cook',
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
 * **This is deliberately not a demo persona** (issue #783). #698 pointed it at
 * the seed's `Aunt Rosa` to avoid "a second source of truth for the same row",
 * which was the wrong trade: `seed_usr_rosa` carries demo ratings, comments and
 * suggestions, so selecting this identity meant *inheriting somebody's content*
 * on every database the demo seed had touched. A test fixture must own nothing,
 * so it is its own row, created only by `db:seed:e2e`.
 *
 * The `e2e_` id prefix and the `.e2e` email domain are load-bearing: they are
 * what {@link isE2eIdentity} and the seed guard match on, so a future fixture
 * cannot be quietly added to the shared seed.
 */
export const DEV_CO_COOK: User = {
  ...DEV_USER,
  id: 'e2e_usr_cocook_000000',
  email: 'co-cook@heirloom.e2e',
  name: 'E2E Co-Cook',
  handle: 'e2e-co-cook',
  slug: 'e2e-co-cook',
};

/**
 * True for identities that may only ever exist in an E2E database.
 *
 * Used by the shared seed's guard and by the unit test that pins it, so the
 * rule is stated once rather than as a list of ids that has to be maintained
 * alongside the identities themselves.
 */
export function isE2eIdentity(user: Pick<User, 'id'>): boolean {
  return user.id.startsWith('e2e_');
}

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
export const DEV_IDENTITY_COOKIE = 'heirloom_dev_identity';

/**
 * Whether the dev identity selector is switched on at all (issue #783).
 *
 * Off unless `E2E_IDENTITY_SELECTOR` is exactly `"1"`. Deliberately not a
 * `NEXT_PUBLIC_` variable: those are inlined into client JavaScript at build
 * time, so that prefix would ship the switch to every browser. CI sets it in
 * the E2E job alone, and it is set on no deployment.
 *
 * Lives here rather than in `~/server/auth` so tests can pin it without
 * importing the Clerk-aware module — that import is heavy enough to time tests
 * out on its own, which is how #698's dev-identity test earned its deletion.
 *
 * Parameterized for tests; the default reads the live environment.
 */
export function isIdentitySelectorEnabled(
  flag: string | undefined = process.env.E2E_IDENTITY_SELECTOR,
): boolean {
  return flag === '1';
}

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
