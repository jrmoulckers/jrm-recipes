import { afterEach, describe, expect, it, vi } from "vitest";

import { track, identify, reset, alias } from "./index";
import {
  clearClientBackend,
  getClientBackend,
  hasClientBackend,
  noopBackend,
  setClientBackend,
  type AnalyticsBackend,
} from "./backend";

/**
 * Build a backend of standalone mock fns (not object methods) so assertions
 * reference the fns directly — avoids `unbound-method` and keeps each spy handy.
 */
function fakeBackend(overrides: Partial<AnalyticsBackend> = {}) {
  const mocks = {
    capture: vi.fn(),
    identify: vi.fn(),
    alias: vi.fn(),
    reset: vi.fn(),
    optIn: vi.fn(),
    optOut: vi.fn(),
    hasOptedOut: vi.fn(() => false),
    isFeatureEnabled: vi.fn(() => undefined),
    getFeatureFlag: vi.fn(() => undefined),
    onFeatureFlags: vi.fn(),
  };
  const backend: AnalyticsBackend = { ...mocks, ...overrides };
  return { backend, mocks };
}

afterEach(() => {
  clearClientBackend();
  vi.restoreAllMocks();
});

describe("analytics client — no-op mode (unconfigured)", () => {
  it("falls back to the no-op backend when none is registered", () => {
    expect(hasClientBackend()).toBe(false);
    expect(getClientBackend()).toBe(noopBackend);
  });

  it("never throws when tracking with no backend", () => {
    expect(() => {
      track("recipe_created", {
        recipeId: "rec_1",
        ingredientCount: 3,
        stepCount: 4,
        hasPhoto: false,
        visibility: "private",
        source: "manual",
      });
      identify("user_1");
      alias("user_1", "anon_1");
      reset();
    }).not.toThrow();
  });

  it("no-op capture returns nothing and does not record anything", () => {
    expect(
      noopBackend.capture("recipe_deleted", { recipeId: "x" }),
    ).toBeUndefined();
    expect(noopBackend.getFeatureFlag("any")).toBeUndefined();
    expect(noopBackend.hasOptedOut()).toBe(false);
  });
});

describe("analytics client — dispatch to a registered backend", () => {
  it("forwards a typed event to the backend", () => {
    const { backend, mocks } = fakeBackend();
    setClientBackend(backend);

    track("cook_completed", {
      recipeId: "rec_9",
      totalSteps: 6,
      durationMs: 1200,
      householdId: null,
    });

    expect(mocks.capture).toHaveBeenCalledWith("cook_completed", {
      recipeId: "rec_9",
      totalSteps: 6,
      durationMs: 1200,
      householdId: null,
    });
  });

  it("scrubs PII out of event properties before dispatch", () => {
    const { backend, mocks } = fakeBackend();
    setClientBackend(backend);

    // Cast through the public API to simulate a careless call site smuggling a
    // PII property the taxonomy would reject at compile time.
    (track as unknown as (n: string, p: Record<string, unknown>) => void)(
      "recipe_created",
      { recipeId: "rec_1", email: "nonna@example.com" },
    );

    expect(mocks.capture).toHaveBeenCalledWith("recipe_created", {
      recipeId: "rec_1",
    });
  });

  it("forwards identify/alias/reset", () => {
    const { backend, mocks } = fakeBackend();
    setClientBackend(backend);

    identify("user_1", { group_count: 2 });
    alias("user_1", "anon_1");
    reset();

    expect(mocks.identify).toHaveBeenCalledWith("user_1", { group_count: 2 });
    expect(mocks.alias).toHaveBeenCalledWith("user_1", "anon_1");
    expect(mocks.reset).toHaveBeenCalled();
  });

  it("swallows backend errors so tracking never breaks the UI", () => {
    const { backend } = fakeBackend({
      capture: vi.fn(() => {
        throw new Error("network down");
      }),
    });
    setClientBackend(backend);

    expect(() => track("share_link_copied", {})).not.toThrow();
  });
});
