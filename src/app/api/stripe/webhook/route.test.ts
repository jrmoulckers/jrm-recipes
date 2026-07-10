import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, db, stripeMock } = vi.hoisted(() => {
  const state = {
    billing: true,
    db: true,
    throwOnVerify: false,
    event: null as unknown,
    upsertValues: null as Record<string, unknown> | null,
    conflictTarget: null as unknown,
  };
  const stripeMock = {
    webhooks: {
      constructEvent: vi.fn(() => {
        if (state.throwOnVerify) throw new Error("bad signature");
        return state.event;
      }),
    },
  };
  const db = {
    query: {
      billingCustomers: { findFirst: vi.fn(async () => ({ id: "bc1" })) },
    },
    insert: vi.fn(() => ({
      values: vi.fn((v: Record<string, unknown>) => {
        state.upsertValues = v;
        return {
          onConflictDoUpdate: vi.fn(async (cfg: { target: unknown }) => {
            state.conflictTarget = cfg.target;
          }),
          onConflictDoNothing: vi.fn(() => ({ returning: async () => [] })),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    })),
  };
  return { state, db, stripeMock };
});

vi.mock("~/env", () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_PRICE_FAMILY: "price_family",
  },
}));
vi.mock("~/server/db", () => ({ db, isDbConfigured: () => state.db }));
vi.mock("~/server/billing/stripe", () => ({
  isBillingConfigured: () => state.billing,
  getStripe: () => stripeMock,
}));

import { POST } from "./route";

function post(body = "{}", headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  state.billing = true;
  state.db = true;
  state.throwOnVerify = false;
  state.event = null;
  state.upsertValues = null;
  state.conflictTarget = null;
  vi.clearAllMocks();
});

describe("POST /api/stripe/webhook", () => {
  it("returns 503 when billing is unconfigured", async () => {
    state.billing = false;
    const res = await POST(post("{}", { "stripe-signature": "sig" }));
    expect(res.status).toBe(503);
  });

  it("returns 400 when the signature header is missing", async () => {
    const res = await POST(post("{}"));
    expect(res.status).toBe(400);
    expect(stripeMock.webhooks.constructEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature with 400 and touches no DB", async () => {
    state.throwOnVerify = true;
    const res = await POST(post("raw", { "stripe-signature": "bad" }));
    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("upserts the subscriptions row for a subscription-updated event", async () => {
    state.event = {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          cancel_at_period_end: false,
          current_period_end: 1_900_000_000,
          metadata: { userId: "u1" },
          items: { data: [{ price: { id: "price_family" }, quantity: 3 }] },
        },
      },
    };
    const res = await POST(post("raw", { "stripe-signature": "good" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(state.upsertValues).toMatchObject({
      stripeSubscriptionId: "sub_1",
      customerId: "bc1",
      status: "active",
      planId: "family",
      seats: 3,
      cancelAtPeriodEnd: false,
    });
  });

  it("mints a gift code on a one-time gift Checkout completion (#331)", async () => {
    state.event = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_gift_1",
          mode: "payment",
          metadata: {
            kind: "gift",
            giftPlanId: "family",
            durationMonths: "12",
            purchaserUserId: "u1",
          },
        },
      },
    };
    const res = await POST(post("raw", { "stripe-signature": "good" }));
    expect(res.status).toBe(200);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(state.upsertValues).toMatchObject({
      status: "issued",
      stripeSessionId: "cs_gift_1",
      planId: "family",
      durationMonths: 12,
      purchaserUserId: "u1",
    });
    expect(typeof state.upsertValues?.code).toBe("string");
  });

  it("acknowledges unknown event types with 200 and ignores them", async () => {
    state.event = { type: "customer.updated", data: { object: {} } };
    const res = await POST(post("raw", { "stripe-signature": "good" }));
    expect(res.status).toBe(200);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
