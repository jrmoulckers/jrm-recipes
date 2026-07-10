import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { PLAN_IDS } from "~/config/plans";
import {
  billingCustomers,
  giftCodes,
  planEnum,
  subscriptionStatus,
  subscriptions,
  usageCounters,
} from "./billing";

/**
 * Issue #300 — the billing schema is the source of truth for who pays and for
 * what. We assert its shape against the compiled Drizzle config (no Postgres in
 * unit tests) and, crucially, pin the `plan_id` enum to `src/config/plans.ts`
 * so the DB constraint and the app's plan catalog can never silently drift.
 */
describe("billing schema (issue #300)", () => {
  it("constrains plan_id to the ids from src/config/plans.ts", () => {
    expect([...planEnum.enumValues].sort()).toEqual([...PLAN_IDS].sort());
  });

  it("mirrors Stripe subscription statuses", () => {
    expect(subscriptionStatus.enumValues).toEqual([
      "trialing",
      "active",
      "past_due",
      "canceled",
      "incomplete",
    ]);
  });

  it("billing_customers maps an owner (user xor group) to a stripe customer", () => {
    const { columns, checks, uniqueConstraints, indexes } =
      getTableConfig(billingCustomers);
    const names = columns.map((c) => c.name);
    for (const n of ["userId", "groupId", "stripeCustomerId"]) {
      expect(names).toContain(n);
    }
    // Exactly-one-owner CHECK and a unique stripe customer id.
    expect(checks.map((c) => c.name)).toContain(
      "billing_customers_owner_check",
    );
    expect(uniqueConstraints.map((u) => u.name)).toContain(
      "billing_customers_stripe_customer_uq",
    );
    // One customer per user and per group.
    const idx = indexes.map((i) => i.config.name);
    expect(idx).toContain("billing_customers_user_uq");
    expect(idx).toContain("billing_customers_group_uq");
  });

  it("subscriptions carries plan, status, period, trial, cancel flag and seats", () => {
    const { columns } = getTableConfig(subscriptions);
    const names = columns.map((c) => c.name);
    for (const n of [
      "customerId",
      "stripeSubscriptionId",
      "planId",
      "status",
      "currentPeriodEnd",
      "trialEnd",
      "cancelAtPeriodEnd",
      "seats",
    ]) {
      expect(names).toContain(n);
    }
  });

  it("usage_counters is unique per (ownerId, metric, periodStart)", () => {
    const { indexes } = getTableConfig(usageCounters);
    const unique = indexes.find(
      (i) => i.config.name === "usage_counters_owner_metric_period_uq",
    );
    expect(unique?.config.unique).toBe(true);
    expect(
      unique?.config.columns.map((c) => (c as { name: string }).name),
    ).toEqual(["ownerId", "metric", "periodStart"]);
  });

  it("gift_codes is single-use per code and idempotent per stripe session", () => {
    const { uniqueConstraints } = getTableConfig(giftCodes);
    const names = uniqueConstraints.map((u) => u.name);
    expect(names).toContain("gift_codes_code_uq");
    expect(names).toContain("gift_codes_stripe_session_uq");
  });
});
