import "server-only";

import { and, eq, inArray, or } from "drizzle-orm";

import {
  getPlanEntitlements,
  type Entitlements,
  type FeatureFlagKey,
  type LimitKey,
  type LimitValue,
  type PlanId,
} from "~/config/plans";
import { db, isDbConfigured } from "~/server/db";
import {
  billingCustomers,
  groupMembers,
  subscriptions,
  type SubscriptionStatus,
  type User,
} from "~/server/db/schema";

/**
 * Entitlements resolver (issue #302) — the single answer to "what may this user
 * do right now?"
 *
 * Server actions already gate on `requireUser()`; premium surfaces gate in
 * parallel on entitlements. Resolution reads only the DB (no Stripe network
 * calls in the hot path) and always degrades to Free: unconfigured DB, no
 * billing customer, or no active/trialing subscription all yield the Free
 * entitlements from `src/config/plans.ts`.
 *
 * A user is entitled via EITHER a personal subscription (their own billing
 * customer) OR a group they belong to (a family subscription grants every
 * member), so Family "just works" for kids and relatives who never paid.
 */

/** Subscription statuses that grant their plan's entitlements. */
const ENTITLED_STATUSES: readonly SubscriptionStatus[] = ["active", "trialing"];

/** Message thrown by {@link requireEntitlement}; distinct from UNAUTHENTICATED. */
export const UPGRADE_REQUIRED = "UPGRADE_REQUIRED";

/**
 * Thrown when a user lacks a required premium entitlement. Mirrors how
 * `requireUser()` throws `UNAUTHENTICATED`, but is its own type/message so
 * server actions can translate it into an upgrade prompt rather than a sign-in.
 */
export class UpgradeRequiredError extends Error {
  readonly entitlement: FeatureFlagKey;
  constructor(entitlement: FeatureFlagKey) {
    super(UPGRADE_REQUIRED);
    this.name = "UpgradeRequiredError";
    this.entitlement = entitlement;
  }
}

/** True for the error thrown by {@link requireEntitlement} (message-based too). */
export function isUpgradeRequiredError(
  error: unknown,
): error is UpgradeRequiredError {
  return error instanceof Error && error.message === UPGRADE_REQUIRED;
}

/**
 * Resolve the caller's effective plan id from the DB. Considers subscriptions on
 * the user's personal billing customer and on every group they belong to, keeps
 * only active/trialing rows whose period hasn't lapsed, and lets any paid plan
 * win over Free. Falls back to Free on an unconfigured DB or no match.
 */
export async function getEffectivePlanId(
  user: User,
  now: Date = new Date(),
): Promise<PlanId> {
  if (!isDbConfigured()) return "free";

  const memberships = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, user.id),
    columns: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);

  const ownerConds = [eq(billingCustomers.userId, user.id)];
  if (groupIds.length > 0) {
    ownerConds.push(inArray(billingCustomers.groupId, groupIds));
  }
  const customers = await db.query.billingCustomers.findMany({
    where: or(...ownerConds),
    columns: { id: true },
  });
  if (customers.length === 0) return "free";

  const subs = await db.query.subscriptions.findMany({
    where: inArray(
      subscriptions.customerId,
      customers.map((c) => c.id),
    ),
    columns: { planId: true, status: true, currentPeriodEnd: true },
  });

  const active = subs.filter(
    (s) =>
      ENTITLED_STATUSES.includes(s.status) &&
      (s.currentPeriodEnd === null || s.currentPeriodEnd > now),
  );
  if (active.length === 0) return "free";

  // Only free/family exist today; any paid plan beats Free.
  return active.some((s) => s.planId !== "free") ? "family" : "free";
}

/** The concrete entitlements for the caller's effective plan (Free by default). */
export async function getEntitlements(
  user: User,
  now: Date = new Date(),
): Promise<Entitlements> {
  return getPlanEntitlements(await getEffectivePlanId(user, now));
}

/** Whether the caller's plan switches on a given premium feature. */
export async function hasEntitlement(
  user: User,
  key: FeatureFlagKey,
  now: Date = new Date(),
): Promise<boolean> {
  const entitlements = await getEntitlements(user, now);
  return entitlements[key];
}

/** The caller's numeric cap for a limit (`null` = unlimited). */
export async function getLimit(
  user: User,
  key: LimitKey,
  now: Date = new Date(),
): Promise<LimitValue> {
  const entitlements = await getEntitlements(user, now);
  return entitlements[key];
}

/**
 * Require a premium feature or throw {@link UpgradeRequiredError}. Returns the
 * resolved entitlements on success so callers can reuse them without a second
 * lookup.
 */
export async function requireEntitlement(
  user: User,
  key: FeatureFlagKey,
  now: Date = new Date(),
): Promise<Entitlements> {
  const entitlements = await getEntitlements(user, now);
  if (!entitlements[key]) {
    throw new UpgradeRequiredError(key);
  }
  return entitlements;
}
