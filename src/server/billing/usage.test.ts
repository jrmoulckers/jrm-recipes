import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "~/server/db/schema";

const { state, db } = vi.hoisted(() => {
  const state = {
    configured: true,
    recipeCount: 0,
    counterRow: undefined as { value: number } | undefined,
    lastInsertValues: null as Record<string, unknown> | null,
    lastConflict: null as { targetLen: number } | null,
  };
  const insertChain = {
    values: vi.fn((v: Record<string, unknown>) => {
      state.lastInsertValues = v;
      return insertChain;
    }),
    onConflictDoUpdate: vi.fn(async (cfg: { target: unknown[] }) => {
      state.lastConflict = { targetLen: cfg.target.length };
    }),
  };
  const db = {
    $count: vi.fn(async () => state.recipeCount),
    query: {
      usageCounters: {
        findFirst: vi.fn(async () => state.counterRow),
      },
    },
    insert: vi.fn(() => insertChain),
  };
  return { state, db };
});

vi.mock("~/server/db", () => ({
  db,
  isDbConfigured: () => state.configured,
}));

import {
  currentPeriodStart,
  getUsage,
  incrementUsage,
  recomputeRecipeCount,
} from "./usage";

const user = { id: "u1" } as unknown as User;

beforeEach(() => {
  state.configured = true;
  state.recipeCount = 0;
  state.counterRow = undefined;
  state.lastInsertValues = null;
  state.lastConflict = null;
  vi.clearAllMocks();
});

describe("currentPeriodStart", () => {
  it("buckets metered metrics into the first of the current UTC month", () => {
    const jan = currentPeriodStart(
      "ai_credits",
      new Date("2025-01-17T09:00:00Z"),
    );
    expect(jan.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("rolls metered metrics to a new bucket the next month", () => {
    const jan = currentPeriodStart(
      "ai_credits",
      new Date("2025-01-31T23:59:59Z"),
    );
    const feb = currentPeriodStart(
      "ai_credits",
      new Date("2025-02-01T00:00:00Z"),
    );
    expect(jan.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(feb.toISOString()).toBe("2025-02-01T00:00:00.000Z");
    expect(feb.getTime()).toBeGreaterThan(jan.getTime());
  });

  it("uses a single lifetime bucket for count metrics", () => {
    const a = currentPeriodStart("recipes", new Date("2025-01-01T00:00:00Z"));
    const b = currentPeriodStart(
      "storage_mb",
      new Date("2030-06-01T00:00:00Z"),
    );
    expect(a.getTime()).toBe(0);
    expect(b.getTime()).toBe(0);
  });
});

describe("getUsage", () => {
  it("reads zero for a fresh account (no counter row)", async () => {
    state.counterRow = undefined;
    expect(await getUsage(user, "ai_credits")).toBe(0);
  });

  it("returns the stored counter value when present", async () => {
    state.counterRow = { value: 42 };
    expect(await getUsage(user, "storage_mb")).toBe(42);
  });

  it("derives the recipes metric live from the recipes table", async () => {
    state.recipeCount = 7;
    expect(await getUsage(user, "recipes")).toBe(7);
    expect(db.$count).toHaveBeenCalledTimes(1);
    expect(db.query.usageCounters.findFirst).not.toHaveBeenCalled();
  });

  it("returns 0 and touches no DB when unconfigured", async () => {
    state.configured = false;
    expect(await getUsage(user, "ai_credits")).toBe(0);
    expect(db.query.usageCounters.findFirst).not.toHaveBeenCalled();
  });
});

describe("recomputeRecipeCount", () => {
  it("counts the user's non-deleted recipes", async () => {
    state.recipeCount = 3;
    expect(await recomputeRecipeCount(user)).toBe(3);
  });

  it("returns 0 when unconfigured", async () => {
    state.configured = false;
    expect(await recomputeRecipeCount(user)).toBe(0);
    expect(db.$count).not.toHaveBeenCalled();
  });
});

describe("incrementUsage", () => {
  it("upserts the counter for the active period", async () => {
    await incrementUsage(user, "ai_credits", 5);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(state.lastInsertValues).toMatchObject({
      ownerId: "u1",
      ownerType: "user",
      metric: "ai_credits",
      value: 5,
    });
    // Conflict target is the (ownerId, metric, periodStart) unique key.
    expect(state.lastConflict?.targetLen).toBe(3);
  });

  it("is a no-op for a zero amount", async () => {
    await incrementUsage(user, "storage_mb", 0);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("is a no-op when unconfigured", async () => {
    state.configured = false;
    await incrementUsage(user, "storage_mb", 10);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
