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
  avatarUrl: null,
  weeklyDigestOptIn: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
