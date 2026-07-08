import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubscriptionStatus, User } from "~/server/db/schema";

type SubRow = {
  planId: "free" | "family";
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
};

type GiftRow = {
  planId: "free" | "family";
  durationMonths: number;
  redeemedAt: Date | null;
};

const { state, db } = vi.hoisted(() => {
  const state = {
    configured: true,
    memberships: [] as { groupId: string }[],
    customers: [] as { id: string }[],
    subs: [] as SubRow[],
    gifts: [] as GiftRow[],
  };
  const db = {
    query: {
      groupMembers: { findMany: vi.fn(async () => state.memberships) },
      billingCustomers: { findMany: vi.fn(async () => state.customers) },
      subscriptions: { findMany: vi.fn(async () => state.subs) },
      giftCodes: { findMany: vi.fn(async () => state.gifts) },
    },
  };
  return { state, db };
});

vi.mock("~/server/db", () => ({
  db,
  isDbConfigured: () => state.configured,
}));

import {
  getEntitlements,
  getEffectivePlanId,
  hasEntitlement,
  requireEntitlement,
  isUpgradeRequiredError,
  UpgradeRequiredError,
} from "./entitlements";

const user = { id: "u1" } as unknown as User;
const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);

beforeEach(() => {
  state.configured = true;
  state.memberships = [];
  state.customers = [];
  state.subs = [];
  state.gifts = [];
  vi.clearAllMocks();
});

describe("getEntitlements", () => {
  it("defaults to Free when the DB is unconfigured", async () => {
    state.configured = false;
    const ent = await getEntitlements(user);
    expect(ent.aiGeneration).toBe(false);
    expect(ent.maxRecipes).toBe(50);
    expect(db.query.groupMembers.findMany).not.toHaveBeenCalled();
  });

  it("defaults to Free when the user has no billing customer", async () => {
    state.customers = [];
    expect(await getEffectivePlanId(user)).toBe("free");
  });

  it("grants premium to a member of a group with an active family subscription", async () => {
    state.memberships = [{ groupId: "g1" }];
    state.customers = [{ id: "c-group" }];
    state.subs = [
      { planId: "family", status: "active", currentPeriodEnd: future },
    ];
    const ent = await getEntitlements(user);
    expect(ent.aiGeneration).toBe(true);
    expect(ent.maxRecipes).toBeNull();
    expect(await getEffectivePlanId(user)).toBe("family");
  });

  it("counts a trialing subscription as entitled", async () => {
    state.customers = [{ id: "c1" }];
    state.subs = [
      { planId: "family", status: "trialing", currentPeriodEnd: future },
    ];
    expect(await hasEntitlement(user, "videoExport")).toBe(true);
  });

  it("falls back to Free for a canceled subscription", async () => {
    state.customers = [{ id: "c1" }];
    state.subs = [
      { planId: "family", status: "canceled", currentPeriodEnd: future },
    ];
    expect(await getEffectivePlanId(user)).toBe("free");
  });

  it("falls back to Free when the active period has lapsed", async () => {
    state.customers = [{ id: "c1" }];
    state.subs = [
      { planId: "family", status: "active", currentPeriodEnd: past },
    ];
    expect(await getEffectivePlanId(user)).toBe("free");
  });

  it("grants Family from a redeemed gift with no subscription (#331)", async () => {
    state.customers = [];
    state.gifts = [
      { planId: "family", durationMonths: 12, redeemedAt: past },
    ];
    expect(await getEffectivePlanId(user)).toBe("family");
    const ent = await getEntitlements(user);
    expect(ent.aiGeneration).toBe(true);
  });

  it("ignores an expired gift and stays on Free (#331)", async () => {
    state.customers = [];
    const longAgo = new Date(Date.now() - 400 * 86_400_000); // >12 months
    state.gifts = [
      { planId: "family", durationMonths: 12, redeemedAt: longAgo },
    ];
    expect(await getEffectivePlanId(user)).toBe("free");
  });

  it("does not consult gifts when a subscription already grants Family (#331)", async () => {
    state.customers = [{ id: "c1" }];
    state.subs = [
      { planId: "family", status: "active", currentPeriodEnd: future },
    ];
    expect(await getEffectivePlanId(user)).toBe("family");
    expect(db.query.giftCodes.findMany).not.toHaveBeenCalled();
  });
});

describe("requireEntitlement", () => {
  it("returns entitlements when the feature is unlocked", async () => {
    state.customers = [{ id: "c1" }];
    state.subs = [
      { planId: "family", status: "active", currentPeriodEnd: null },
    ];
    const ent = await requireEntitlement(user, "aiTutor");
    expect(ent.aiTutor).toBe(true);
  });

  it("throws a distinct UPGRADE_REQUIRED error on Free", async () => {
    state.customers = [];
    await expect(requireEntitlement(user, "aiGeneration")).rejects.toThrow(
      "UPGRADE_REQUIRED",
    );
    try {
      await requireEntitlement(user, "aiGeneration");
      expect.unreachable();
    } catch (error) {
      expect(isUpgradeRequiredError(error)).toBe(true);
      expect(error).toBeInstanceOf(UpgradeRequiredError);
      expect((error as UpgradeRequiredError).message).not.toBe("UNAUTHENTICATED");
      expect((error as UpgradeRequiredError).entitlement).toBe("aiGeneration");
    }
  });
});
