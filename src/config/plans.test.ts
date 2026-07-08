import { describe, expect, it } from "vitest";

import {
  FEATURE_FLAG_KEYS,
  LIMIT_KEYS,
  PLAN_IDS,
  PLAN_LIST,
  PLANS,
  getPlan,
  getPlanEntitlements,
  isPlanId,
  isUnlimited,
  limitToNumber,
  type EntitlementKey,
} from "./plans";

const ALL_KEYS: EntitlementKey[] = [...FEATURE_FLAG_KEYS, ...LIMIT_KEYS];

describe("plans catalog", () => {
  it("defines free and family plans", () => {
    expect(PLAN_IDS).toEqual(["free", "family"]);
    expect(PLANS.free.id).toBe("free");
    expect(PLANS.family.id).toBe("family");
  });

  it("every plan has a complete entitlements object (no missing keys)", () => {
    for (const plan of PLAN_LIST) {
      const keys = Object.keys(plan.entitlements).sort();
      expect(keys).toEqual([...ALL_KEYS].sort());
      for (const key of FEATURE_FLAG_KEYS) {
        expect(typeof plan.entitlements[key]).toBe("boolean");
      }
      for (const key of LIMIT_KEYS) {
        const value = plan.entitlements[key];
        expect(value === null || typeof value === "number").toBe(true);
      }
    }
  });

  it("Free is a strict subset of Family", () => {
    const free = PLANS.free.entitlements;
    const fam = PLANS.family.entitlements;

    // Feature flags: anything Free unlocks, Family also unlocks.
    for (const key of FEATURE_FLAG_KEYS) {
      if (free[key]) expect(fam[key]).toBe(true);
    }
    // Limits: Free never allows more than Family (null = unlimited = max).
    for (const key of LIMIT_KEYS) {
      expect(limitToNumber(free[key])).toBeLessThanOrEqual(
        limitToNumber(fam[key]),
      );
    }

    // Strict: Family must exceed Free somewhere.
    const strictlyBigger = ALL_KEYS.some((key) => {
      if (FEATURE_FLAG_KEYS.includes(key as never)) {
        return fam[key as never] && !free[key as never];
      }
      return (
        limitToNumber(fam[key as never]) > limitToNumber(free[key as never])
      );
    });
    expect(strictlyBigger).toBe(true);
  });

  it("family unlocks every premium feature flag", () => {
    for (const key of FEATURE_FLAG_KEYS) {
      expect(PLANS.family.entitlements[key]).toBe(true);
    }
  });

  it("keeps Stripe price references as env names, never secrets", () => {
    expect(PLANS.free.stripePriceEnvKey).toBeNull();
    expect(PLANS.family.stripePriceEnvKey).toBe("STRIPE_PRICE_FAMILY");
    // No plan should embed a live Stripe id/secret in code.
    for (const plan of PLAN_LIST) {
      expect(JSON.stringify(plan)).not.toMatch(/sk_live|price_[0-9A-Za-z]{6}/);
    }
  });

  it("getPlan / helpers resolve safely", () => {
    expect(getPlan("family").id).toBe("family");
    expect(getPlan("does-not-exist").id).toBe("free");
    expect(getPlanEntitlements("family").aiGeneration).toBe(true);
    expect(isPlanId("free")).toBe(true);
    expect(isPlanId("gold")).toBe(false);
    expect(isUnlimited(null)).toBe(true);
    expect(isUnlimited(50)).toBe(false);
    expect(limitToNumber(null)).toBe(Number.POSITIVE_INFINITY);
    expect(limitToNumber(200)).toBe(200);
  });

  it("declares a Family free-trial length", () => {
    expect(PLANS.free.trialDays).toBe(0);
    expect(PLANS.family.trialDays).toBeGreaterThan(0);
  });
});
