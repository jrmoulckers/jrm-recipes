import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MemoryRateLimitStore,
  RATE_LIMITS,
  checkRateLimit,
  setRateLimitStore,
} from "./rate-limit";

describe("MemoryRateLimitStore", () => {
  const rule = { limit: 3, windowMs: 1_000 };

  it("allows up to the limit within a window, then blocks", () => {
    const store = new MemoryRateLimitStore();
    const now = 1_000;

    expect(store.hit("k", rule, now).ok).toBe(true);
    expect(store.hit("k", rule, now).ok).toBe(true);
    const third = store.hit("k", rule, now);
    expect(third.ok).toBe(true);
    expect(third.remaining).toBe(0);

    const blocked = store.hit("k", rule, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const store = new MemoryRateLimitStore();
    store.hit("k", rule, 0);
    store.hit("k", rule, 0);
    store.hit("k", rule, 0);
    expect(store.hit("k", rule, 0).ok).toBe(false);

    // Past the window boundary the counter starts fresh.
    const after = store.hit("k", rule, 1_001);
    expect(after.ok).toBe(true);
    expect(after.remaining).toBe(rule.limit - 1);
  });

  it("keys independently so one caller can't exhaust another's budget", () => {
    const store = new MemoryRateLimitStore();
    store.hit("a", rule, 0);
    store.hit("a", rule, 0);
    store.hit("a", rule, 0);
    expect(store.hit("a", rule, 0).ok).toBe(false);
    // A different key is unaffected.
    expect(store.hit("b", rule, 0).ok).toBe(true);
  });
});

describe("checkRateLimit", () => {
  let store: MemoryRateLimitStore;

  beforeEach(() => {
    store = new MemoryRateLimitStore();
    setRateLimitStore(store);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setRateLimitStore(new MemoryRateLimitStore());
  });

  it("enforces the named budget for an identifier", () => {
    const now = 0;
    const { limit } = RATE_LIMITS.import;
    for (let i = 0; i < limit; i++) {
      expect(checkRateLimit("import", "user_1", now).ok).toBe(true);
    }
    expect(checkRateLimit("import", "user_1", now).ok).toBe(false);
    // Distinct identifier keeps its own budget.
    expect(checkRateLimit("import", "user_2", now).ok).toBe(true);
  });

  it("never blocks when disabled via env", () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "1");
    const now = 0;
    for (let i = 0; i < RATE_LIMITS.import.limit + 5; i++) {
      expect(checkRateLimit("import", "user_1", now).ok).toBe(true);
    }
  });

  it("scales budgets by RATE_LIMIT_FACTOR", () => {
    vi.stubEnv("RATE_LIMIT_FACTOR", "2");
    const now = 0;
    const scaled = RATE_LIMITS.import.limit * 2;
    for (let i = 0; i < scaled; i++) {
      expect(checkRateLimit("import", "user_1", now).ok).toBe(true);
    }
    expect(checkRateLimit("import", "user_1", now).ok).toBe(false);
  });
});
