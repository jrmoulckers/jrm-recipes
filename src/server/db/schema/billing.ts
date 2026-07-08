import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { groups } from "./groups";

/**
 * Billing schema — who is paying, for which plan, and the live state of their
 * Stripe subscription (issues #300/#301/#325/#326/#331).
 *
 * Per the batch's single-migration rule, ALL billing tables live here and are
 * covered by one consolidated, idempotent Drizzle migration:
 *   - `billing_customers` — maps an owner (user OR group) to a Stripe customer.
 *   - `subscriptions`     — a Stripe subscription's synced state + seats/trial.
 *   - `usage_counters`    — metered usage (recipes/storage/AI) per period (#301).
 *   - `gift_codes`        — one-time gift purchases + redemption (#331).
 *
 * `planId` mirrors the ids in `src/config/plans.ts`; `status` mirrors Stripe's
 * subscription statuses. A schema test pins the plan-id enum to the config so
 * the two can never drift.
 */

/** Which plan a paid subscription grants. Mirrors ids in src/config/plans.ts. */
export const planEnum = pgEnum("plan_id", ["free", "family"]);

/** Stripe subscription lifecycle states we sync and gate on. */
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
]);

/** Billing can be owned by a single user (personal) or a group (family). */
export const billingOwnerType = pgEnum("billing_owner_type", ["user", "group"]);

/** Metered/counted resources tracked in `usage_counters` (#301). */
export const usageMetric = pgEnum("usage_metric", [
  "recipes",
  "storage_mb",
  "ai_credits",
]);

/** Gift-code lifecycle: issued at purchase, then redeemed once (#331). */
export const giftStatus = pgEnum("gift_status", ["issued", "redeemed"]);

/**
 * Maps a billing owner to their Stripe customer. Exactly one of `userId` /
 * `groupId` is set (enforced by a CHECK): personal plans are owned by a user,
 * Family plans by a group. Unique per owner so we never mint two Stripe
 * customers for the same account.
 */
export const billingCustomers = pgTable(
  "billing_customers",
  {
    id: pk(),
    userId: fk().references(() => users.id, { onDelete: "cascade" }),
    groupId: fk().references(() => groups.id, { onDelete: "cascade" }),
    stripeCustomerId: varchar({ length: 255 }).notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("billing_customers_stripe_customer_uq").on(t.stripeCustomerId),
    // At most one billing customer per user and per group. Postgres treats NULLs
    // as distinct, so group-owned rows (userId NULL) don't collide, and vice
    // versa — the unique indexes double as the FK cover indexes (#153).
    uniqueIndex("billing_customers_user_uq").on(t.userId),
    uniqueIndex("billing_customers_group_uq").on(t.groupId),
    // Exactly one owner: a user XOR a group.
    check(
      "billing_customers_owner_check",
      sql`(${t.userId} is not null) <> (${t.groupId} is not null)`,
    ),
  ],
);

/**
 * A Stripe subscription's synced state. `seats` backs Family seat enforcement
 * (#325); `trialEnd` backs trial messaging (#326). Free is represented by the
 * *absence* of an active row, never a stored row.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: pk(),
    customerId: fk()
      .notNull()
      .references(() => billingCustomers.id, { onDelete: "cascade" }),
    stripeSubscriptionId: varchar({ length: 255 }).notNull(),
    stripePriceId: varchar({ length: 255 }),
    planId: planEnum().notNull().default("family"),
    status: subscriptionStatus().notNull(),
    currentPeriodEnd: timestamp({ withTimezone: true }),
    trialEnd: timestamp({ withTimezone: true }),
    cancelAtPeriodEnd: boolean().notNull().default(false),
    seats: integer().notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    unique("subscriptions_stripe_subscription_uq").on(t.stripeSubscriptionId),
    index("subscriptions_customer_idx").on(t.customerId),
    index("subscriptions_status_idx").on(t.status),
  ],
);

/**
 * Usage meter rows keyed by `(ownerId, metric, periodStart)` (#301). Count
 * metrics (recipes) use a sentinel `periodStart` (lifetime); metered metrics
 * (aiCredits) use the current month so they roll over automatically. `ownerId`
 * is a user or group cuid — globally unique, so no cross-table FK is possible
 * (hence no `references`); `ownerType` records which it is.
 */
export const usageCounters = pgTable(
  "usage_counters",
  {
    id: pk(),
    ownerId: fk().notNull(),
    ownerType: billingOwnerType().notNull(),
    metric: usageMetric().notNull(),
    periodStart: timestamp({ withTimezone: true }).notNull(),
    value: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("usage_counters_owner_metric_period_uq").on(
      t.ownerId,
      t.metric,
      t.periodStart,
    ),
    index("usage_counters_owner_idx").on(t.ownerId),
  ],
);

/**
 * A purchased gift of Family (#331). Created (status `issued`) by the webhook on
 * a one-time Checkout completion, keyed idempotently to its `stripeSessionId`;
 * redeemed exactly once, granting `durationMonths` of `planId` to the redeemer
 * (or their group).
 */
export const giftCodes = pgTable(
  "gift_codes",
  {
    id: pk(),
    code: varchar({ length: 32 }).notNull(),
    planId: planEnum().notNull().default("family"),
    durationMonths: integer().notNull().default(12),
    purchaserUserId: fk().references(() => users.id, { onDelete: "set null" }),
    stripeSessionId: varchar({ length: 255 }),
    status: giftStatus().notNull().default("issued"),
    redeemedByUserId: fk().references(() => users.id, { onDelete: "set null" }),
    redeemedByGroupId: fk().references(() => groups.id, {
      onDelete: "set null",
    }),
    redeemedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("gift_codes_code_uq").on(t.code),
    // One gift row per Stripe Checkout session → idempotent webhook creation.
    unique("gift_codes_stripe_session_uq").on(t.stripeSessionId),
    // FK cover indexes (#153) for the set-null cascades on user/group delete.
    index("gift_codes_purchaser_idx").on(t.purchaserUserId),
    index("gift_codes_redeemed_by_user_idx").on(t.redeemedByUserId),
    index("gift_codes_redeemed_by_group_idx").on(t.redeemedByGroupId),
  ],
);

export const billingCustomersRelations = relations(
  billingCustomers,
  ({ one, many }) => ({
    user: one(users, {
      fields: [billingCustomers.userId],
      references: [users.id],
    }),
    group: one(groups, {
      fields: [billingCustomers.groupId],
      references: [groups.id],
    }),
    subscriptions: many(subscriptions),
  }),
);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  customer: one(billingCustomers, {
    fields: [subscriptions.customerId],
    references: [billingCustomers.id],
  }),
}));

export const giftCodesRelations = relations(giftCodes, ({ one }) => ({
  purchaser: one(users, {
    fields: [giftCodes.purchaserUserId],
    references: [users.id],
    relationName: "giftPurchaser",
  }),
  redeemedByUser: one(users, {
    fields: [giftCodes.redeemedByUserId],
    references: [users.id],
    relationName: "giftRedeemer",
  }),
  redeemedByGroup: one(groups, {
    fields: [giftCodes.redeemedByGroupId],
    references: [groups.id],
  }),
}));

export type BillingCustomer = typeof billingCustomers.$inferSelect;
export type NewBillingCustomer = typeof billingCustomers.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionStatus = (typeof subscriptionStatus.enumValues)[number];
export type UsageCounter = typeof usageCounters.$inferSelect;
export type NewUsageCounter = typeof usageCounters.$inferInsert;
export type UsageMetric = (typeof usageMetric.enumValues)[number];
export type BillingOwnerType = (typeof billingOwnerType.enumValues)[number];
export type GiftCode = typeof giftCodes.$inferSelect;
export type NewGiftCode = typeof giftCodes.$inferInsert;
export type GiftStatus = (typeof giftStatus.enumValues)[number];
