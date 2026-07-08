import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, db, stripeMock, giftMock } = vi.hoisted(() => {
  const state = {
    billing: true,
    db: true,
    price: "price_family" as string | undefined,
    giftPrice: "price_gift" as string | undefined,
    customer: undefined as { stripeCustomerId: string } | undefined,
    user: { email: "a@b.com", name: "Ann" } as {
      email: string | null;
      name: string | null;
    } | null,
    checkoutUrl: "https://stripe.test/checkout" as string | null,
    portalUrl: "https://stripe.test/portal",
  };
  const stripeMock = {
    customers: { create: vi.fn(async () => ({ id: "cus_new" })) },
    checkout: {
      sessions: {
        create: vi.fn(async (_args: Record<string, unknown>) => ({
          url: state.checkoutUrl,
        })),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async (_args: Record<string, unknown>) => ({
          url: state.portalUrl,
        })),
      },
    },
  };
  const db = {
    query: {
      billingCustomers: { findFirst: vi.fn(async () => state.customer) },
      users: { findFirst: vi.fn(async () => state.user) },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(async () => undefined),
      })),
    })),
  };
  const giftMock = {
    redeemGiftCode: vi.fn(async () => ({
      planId: "family" as const,
      durationMonths: 12,
      redeemedAt: new Date(),
    })),
  };
  return { state, db, stripeMock, giftMock };
});

vi.mock("~/env", () => ({
  env: {
    get STRIPE_PRICE_FAMILY() {
      return state.price;
    },
    get STRIPE_PRICE_GIFT_FAMILY() {
      return state.giftPrice;
    },
    NEXT_PUBLIC_APP_URL: "https://app.test",
  },
}));
vi.mock("~/server/db", () => ({ db, isDbConfigured: () => state.db }));
vi.mock("~/server/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("./stripe", () => ({
  isBillingConfigured: () => state.billing,
  getStripe: () => stripeMock,
}));
vi.mock("./gifting", () => ({
  redeemGiftCode: giftMock.redeemGiftCode,
  GIFT_NOT_FOUND: "GIFT_NOT_FOUND",
  GIFT_ALREADY_REDEEMED: "GIFT_ALREADY_REDEEMED",
}));

import {
  createBillingPortalSessionAction,
  createCheckoutSessionAction,
  createGiftCheckoutSessionAction,
  redeemGiftAction,
} from "./actions";

beforeEach(() => {
  state.billing = true;
  state.db = true;
  state.price = "price_family";
  state.giftPrice = "price_gift";
  state.customer = undefined;
  state.checkoutUrl = "https://stripe.test/checkout";
  vi.clearAllMocks();
});

describe("createCheckoutSessionAction", () => {
  it("errors gracefully when billing is unconfigured", async () => {
    state.billing = false;
    const result = await createCheckoutSessionAction("family");
    expect(result.ok).toBe(false);
  });

  it("errors gracefully when the DB is unconfigured", async () => {
    state.db = false;
    const result = await createCheckoutSessionAction("family");
    expect(result.ok).toBe(false);
  });

  it("rejects the free plan", async () => {
    const result = await createCheckoutSessionAction("free");
    expect(result).toEqual({ ok: false, error: "Choose a paid plan to upgrade." });
  });

  it("reports not-available when the price env var is unset", async () => {
    state.price = undefined;
    const result = await createCheckoutSessionAction("family");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/isn't available/);
  });

  it("creates a customer and returns a Checkout URL for a paid plan", async () => {
    const result = await createCheckoutSessionAction("family");
    expect(result).toEqual({ ok: true, url: "https://stripe.test/checkout" });
    expect(stripeMock.customers.create).toHaveBeenCalledTimes(1);
    const args = stripeMock.checkout.sessions.create.mock.calls[0]?.[0];
    expect(args).toMatchObject({ mode: "subscription", customer: "cus_new" });
    expect(args?.success_url).toContain("https://app.test/settings/billing");
    expect(args?.cancel_url).toContain("https://app.test/pricing");
  });

  it("enables promo codes and starts the plan's free trial (#326)", async () => {
    await createCheckoutSessionAction("family");
    const args = stripeMock.checkout.sessions.create.mock.calls[0]?.[0] as
      | {
          allow_promotion_codes?: boolean;
          subscription_data?: { trial_period_days?: number };
        }
      | undefined;
    // Stripe-managed coupons at checkout.
    expect(args?.allow_promotion_codes).toBe(true);
    // Family declares a 14-day trial in src/config/plans.ts.
    expect(args?.subscription_data?.trial_period_days).toBe(14);
  });
});

describe("createBillingPortalSessionAction", () => {
  it("returns a friendly error when the caller has no customer", async () => {
    state.customer = undefined;
    const result = await createBillingPortalSessionAction();
    expect(result.ok).toBe(false);
    expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("returns a portal URL for an existing customer", async () => {
    state.customer = { stripeCustomerId: "cus_1" };
    const result = await createBillingPortalSessionAction();
    expect(result).toEqual({ ok: true, url: "https://stripe.test/portal" });
    const args = stripeMock.billingPortal.sessions.create.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      customer: "cus_1",
      return_url: "https://app.test/settings/billing",
    });
  });
});

describe("createGiftCheckoutSessionAction (#331)", () => {
  it("errors gracefully when billing is unconfigured", async () => {
    state.billing = false;
    const result = await createGiftCheckoutSessionAction();
    expect(result.ok).toBe(false);
  });

  it("reports not-available when the gift price env var is unset", async () => {
    state.giftPrice = undefined;
    const result = await createGiftCheckoutSessionAction();
    expect(result.ok).toBe(false);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("creates a one-time Checkout stamped with gift metadata", async () => {
    const result = await createGiftCheckoutSessionAction();
    expect(result).toEqual({ ok: true, url: "https://stripe.test/checkout" });
    const args = stripeMock.checkout.sessions.create.mock.calls[0]?.[0] as
      | {
          mode?: string;
          metadata?: Record<string, string>;
          success_url?: string;
        }
      | undefined;
    expect(args?.mode).toBe("payment");
    expect(args?.metadata).toMatchObject({
      kind: "gift",
      giftPlanId: "family",
      durationMonths: "12",
      purchaserUserId: "u1",
    });
    expect(args?.success_url).toContain("https://app.test/redeem");
  });
});

describe("redeemGiftAction (#331)", () => {
  it("errors gracefully when the DB is unconfigured", async () => {
    state.db = false;
    const result = await redeemGiftAction("GIFT-CODE");
    expect(result.ok).toBe(false);
    expect(giftMock.redeemGiftCode).not.toHaveBeenCalled();
  });

  it("rejects an empty code before touching the DB", async () => {
    const result = await redeemGiftAction("   ");
    expect(result.ok).toBe(false);
    expect(giftMock.redeemGiftCode).not.toHaveBeenCalled();
  });

  it("grants Family on a valid redemption", async () => {
    const result = await redeemGiftAction("gift-ab3d-7f9k-2qx4");
    expect(result).toEqual({ ok: true, planId: "family", durationMonths: 12 });
    expect(giftMock.redeemGiftCode).toHaveBeenCalledWith({
      code: "gift-ab3d-7f9k-2qx4",
      userId: "u1",
    });
  });

  it("maps an already-redeemed code to a friendly message", async () => {
    giftMock.redeemGiftCode.mockRejectedValueOnce(
      new Error("GIFT_ALREADY_REDEEMED"),
    );
    const result = await redeemGiftAction("GIFT-USED");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already been redeemed/i);
  });

  it("maps an unknown code to a friendly message", async () => {
    giftMock.redeemGiftCode.mockRejectedValueOnce(new Error("GIFT_NOT_FOUND"));
    const result = await redeemGiftAction("GIFT-NOPE");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/isn't valid/i);
  });
});
