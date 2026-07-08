import { DomainError } from "~/server/errors";
import type { MemberRole } from "~/server/db/schema";

/**
 * Kid-safe capability model (issue #345).
 *
 * Groups already carry a `kid` role, but until now it behaved like a normal
 * member. For a family product used by children the kid role must be genuinely
 * safer: no destructive actions, no publishing things to the public web, no
 * member management, and no exposure to moderated/hidden content. This module is
 * the SINGLE SOURCE OF TRUTH for those guardrails — server mutations gate on
 * {@link roleCan}/{@link assertKidAllowed} and the UI hides/disables the same
 * capabilities via {@link roleCan}, so the two never drift.
 */

/** A gated capability a kid-role member must never be able to exercise. */
export type KidRestrictedCapability =
  /** Delete a recipe. */
  | "delete_recipe"
  /** Delete a comment/suggestion (their own or anyone's). */
  | "delete_comment"
  /** Change a recipe's visibility to `public` (publish to the open web). */
  | "make_recipe_public"
  /** Invite, remove, or re-role group members. */
  | "manage_members"
  /** Report content or open the moderation queue (adult-facing safety tools). */
  | "moderate_content"
  /** See content hidden/flagged by moderation, or reactions/who-reacted on it. */
  | "see_moderated_content";

/**
 * Everything a kid is NOT allowed to do. Membership in this set is the whole
 * policy: to loosen or tighten the kid role, edit this set and both the server
 * guards and the UI follow automatically.
 */
const KID_RESTRICTED: ReadonlySet<KidRestrictedCapability> = new Set([
  "delete_recipe",
  "delete_comment",
  "make_recipe_public",
  "manage_members",
  "moderate_content",
  "see_moderated_content",
]);

/** Is this member (by role) the restricted kid role? */
export function isKid(role: MemberRole | null | undefined): boolean {
  return role === "kid";
}

/**
 * Whether a member with `role` may exercise `capability`. Only the kid role is
 * constrained here — every other role's finer-grained permissions (owner/admin
 * vs. member) are enforced by the existing role checks in
 * `groups/mutations.ts` and friends. A `null`/absent role (a non-member) is
 * unconstrained by *this* helper: non-members are gated by the surrounding
 * access-control checks (membership/visibility), not the kid-capability policy.
 */
export function roleCan(
  role: MemberRole | null | undefined,
  capability: KidRestrictedCapability,
): boolean {
  if (isKid(role)) return !KID_RESTRICTED.has(capability);
  return true;
}

/**
 * Server-side guard: throw a typed {@link DomainError} a caller maps to friendly
 * copy when a kid attempts a restricted capability. Callers translate it through
 * `messageForError(error, { FORBIDDEN: "…" })` exactly like any other gate.
 */
export function assertKidAllowed(
  role: MemberRole | null | undefined,
  capability: KidRestrictedCapability,
): void {
  if (!roleCan(role, capability)) {
    throw new DomainError("FORBIDDEN");
  }
}
