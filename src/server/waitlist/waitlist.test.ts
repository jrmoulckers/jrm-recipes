import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, db } = vi.hoisted(() => {
  const state = {
    configured: true,
    rows: [{ id: "w1" }] as { id: string }[],
    lastValues: null as { email: string; source: string } | null,
  };
  const chain = {
    values: vi.fn((v: { email: string; source: string }) => {
      state.lastValues = v;
      return chain;
    }),
    onConflictDoNothing: vi.fn(() => chain),
    returning: vi.fn(async () => state.rows),
  };
  const db = { insert: vi.fn(() => chain) };
  return { state, db };
});

vi.mock("~/server/db", () => ({
  db,
  isDbConfigured: () => state.configured,
}));

import { createRateLimiter } from "./rate-limit";
import { waitlistInput } from "./validation";
import { addToWaitlist } from "./mutations";
import { joinWaitlistAction } from "./actions";

beforeEach(() => {
  state.configured = true;
  state.rows = [{ id: "w1" }];
  state.lastValues = null;
  vi.clearAllMocks();
});

describe("waitlistInput validation", () => {
  it("normalizes email to trimmed lowercase and defaults the source", () => {
    const parsed = waitlistInput.parse({ email: "  Cook@Example.COM " });
    expect(parsed).toEqual({ email: "cook@example.com", source: "landing" });
  });

  it("rejects malformed emails", () => {
    expect(waitlistInput.safeParse({ email: "not-an-email" }).success).toBe(
      false,
    );
    expect(waitlistInput.safeParse({ email: "" }).success).toBe(false);
  });

  it("rejects an over-long email (size guard)", () => {
    const huge = `${"a".repeat(320)}@example.com`;
    expect(waitlistInput.safeParse({ email: huge }).success).toBe(false);
  });

  it("only accepts known source tags", () => {
    expect(
      waitlistInput.safeParse({ email: "a@b.com", source: "hero" }).success,
    ).toBe(true);
    expect(
      waitlistInput.safeParse({ email: "a@b.com", source: "evil" }).success,
    ).toBe(false);
  });
});

describe("createRateLimiter", () => {
  it("allows up to the limit then blocks within the window", () => {
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.hit(0)).toBe(true);
    expect(limiter.hit(100)).toBe(true);
    expect(limiter.hit(200)).toBe(false);
  });

  it("frees capacity once older hits age out of the window", () => {
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.hit(0)).toBe(true);
    expect(limiter.hit(500)).toBe(true);
    expect(limiter.hit(600)).toBe(false);
    // The first hit (t=0) has now aged out of the 1000ms window.
    expect(limiter.hit(1001)).toBe(true);
  });
});

describe("addToWaitlist", () => {
  it("returns 'unavailable' and touches no DB when unconfigured", async () => {
    state.configured = false;
    expect(await addToWaitlist({ email: "a@b.com", source: "landing" })).toBe(
      "unavailable",
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 'created' when a new row is inserted", async () => {
    state.rows = [{ id: "w1" }];
    expect(await addToWaitlist({ email: "a@b.com", source: "landing" })).toBe(
      "created",
    );
  });

  it("returns 'duplicate' when the email already exists (no row returned)", async () => {
    state.rows = [];
    expect(await addToWaitlist({ email: "a@b.com", source: "landing" })).toBe(
      "duplicate",
    );
  });
});

describe("joinWaitlistAction", () => {
  it("rejects an invalid email with field errors", async () => {
    const result = await joinWaitlistAction({ email: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.email?.length).toBeGreaterThan(0);
  });

  it("persists a normalized email and reports non-duplicate success", async () => {
    state.rows = [{ id: "w1" }];
    const result = await joinWaitlistAction({
      email: "  New@Example.com ",
      source: "closing",
    });
    expect(result).toEqual({ ok: true, duplicate: false });
    expect(state.lastValues).toEqual({
      email: "new@example.com",
      source: "closing",
    });
  });

  it("reports duplicate success for an already-captured email", async () => {
    state.rows = [];
    const result = await joinWaitlistAction({ email: "dupe@example.com" });
    expect(result).toEqual({ ok: true, duplicate: true });
  });

  it("succeeds without persisting when the DB is unconfigured", async () => {
    state.configured = false;
    const result = await joinWaitlistAction({ email: "a@b.com" });
    expect(result).toEqual({ ok: true, duplicate: false });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
