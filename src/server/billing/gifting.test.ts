import { beforeEach, describe, expect, it, vi } from "vitest";

type GiftRow = {
  planId: "free" | "family";
  durationMonths: number;
  redeemedAt: Date | null;
};

const { state, db } = vi.hoisted(() => {
  const state = {
    configured: true,
    updateReturning: [] as { planId: "free" | "family"; durationMonths: number }[],
    findFirst: undefined as { status: string } | undefined,
    findMany: [] as GiftRow[],
    inserted: null as Record<string, unknown> | null,
  };
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((v: Record<string, unknown>) => {
        state.inserted = v;
        return { onConflictDoNothing: vi.fn(async () => undefined) };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => state.updateReturning),
        })),
      })),
    })),
    query: {
      giftCodes: {
        findFirst: vi.fn(async () => state.findFirst),
        findMany: vi.fn(async () => state.findMany),
      },
    },
  };
  return { state, db };
});

vi.mock("~/server/db", () => ({ db, isDbConfigured: () => state.configured }));

import {
  generateGiftCode,
  normalizeGiftCode,
  mintGiftCode,
  redeemGiftCode,
  getActiveGiftPlanId,
  GIFT_NOT_FOUND,
  GIFT_ALREADY_REDEEMED,
} from "./gifting";

const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
};

beforeEach(() => {
  state.configured = true;
  state.updateReturning = [];
  state.findFirst = undefined;
  state.findMany = [];
  state.inserted = null;
  vi.clearAllMocks();
});

describe("generateGiftCode", () => {
  it("produces a grouped, unguessable code from the safe alphabet", () => {
    const code = generateGiftCode();
    expect(code).toMatch(/^GIFT-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    // No ambiguous characters (0/1/I/O) leak into the code.
    expect(code.replace("GIFT-", "")).not.toMatch(/[01IO]/);
  });

  it("is effectively unique across calls", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateGiftCode()));
    expect(codes.size).toBe(200);
  });
});

describe("normalizeGiftCode", () => {
  it("trims and upper-cases so casual input still matches", () => {
    expect(normalizeGiftCode("  gift-ab3d-7f9k-2qx4 ")).toBe("GIFT-AB3D-7F9K-2QX4");
  });
});

describe("mintGiftCode", () => {
  it("issues a single-use code keyed to the Stripe session", async () => {
    const code = await mintGiftCode({
      stripeSessionId: "cs_1",
      purchaserUserId: "u1",
      planId: "family",
      durationMonths: 12,
    });
    expect(code).toMatch(/^GIFT-/);
    expect(state.inserted).toMatchObject({
      code,
      status: "issued",
      stripeSessionId: "cs_1",
      purchaserUserId: "u1",
      planId: "family",
      durationMonths: 12,
    });
    // Idempotent insert — a retried webhook can't create a second row.
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("falls back to the gift config defaults", async () => {
    await mintGiftCode({ stripeSessionId: "cs_2" });
    expect(state.inserted).toMatchObject({
      status: "issued",
      planId: "family",
      durationMonths: 12,
      purchaserUserId: null,
    });
  });
});

describe("redeemGiftCode", () => {
  it("claims an issued code and returns the granted plan + duration", async () => {
    state.updateReturning = [{ planId: "family", durationMonths: 12 }];
    const result = await redeemGiftCode({ code: "gift-ab3d-7f9k-2qx4", userId: "u1" });
    expect(result.planId).toBe("family");
    expect(result.durationMonths).toBe(12);
    expect(result.redeemedAt).toBeInstanceOf(Date);
  });

  it("rejects a re-redemption of an already-used code", async () => {
    state.updateReturning = []; // conditional update claimed nothing
    state.findFirst = { status: "redeemed" };
    await expect(
      redeemGiftCode({ code: "GIFT-USED", userId: "u2" }),
    ).rejects.toThrow(GIFT_ALREADY_REDEEMED);
  });

  it("rejects an unknown code", async () => {
    state.updateReturning = [];
    state.findFirst = undefined;
    await expect(
      redeemGiftCode({ code: "GIFT-NOPE", userId: "u2" }),
    ).rejects.toThrow(GIFT_NOT_FOUND);
  });
});

describe("getActiveGiftPlanId", () => {
  it("grants Family while a redeemed gift is still within its window", async () => {
    state.findMany = [
      { planId: "family", durationMonths: 12, redeemedAt: monthsAgo(1) },
    ];
    expect(await getActiveGiftPlanId("u1")).toBe("family");
  });

  it("returns null once the gifted window has lapsed", async () => {
    state.findMany = [
      { planId: "family", durationMonths: 12, redeemedAt: monthsAgo(24) },
    ];
    expect(await getActiveGiftPlanId("u1")).toBeNull();
  });

  it("returns null when there are no redeemed gifts", async () => {
    state.findMany = [];
    expect(await getActiveGiftPlanId("u1")).toBeNull();
  });

  it("returns null when the DB is unconfigured", async () => {
    state.configured = false;
    expect(await getActiveGiftPlanId("u1")).toBeNull();
    expect(db.query.giftCodes.findMany).not.toHaveBeenCalled();
  });
});
