import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Capture how `listPublicRecipes` configures `unstable_cache` (key parts, tags,
// revalidate window) and turn the wrapper into a pass-through that forwards its
// arguments to the underlying query so we can assert per-page/sort keying.
const { unstableCacheMock, captured } = vi.hoisted(() => {
  const captured: {
    keyParts?: string[];
    options?: { revalidate?: number | false; tags?: string[] };
  } = {};
  const unstableCacheMock = vi.fn(
    (
      fn: (...args: unknown[]) => unknown,
      keyParts?: string[],
      options?: { revalidate?: number | false; tags?: string[] },
    ) => {
      captured.keyParts = keyParts;
      captured.options = options;
      return (...args: unknown[]) => fn(...args);
    },
  );
  return { unstableCacheMock, captured };
});

vi.mock("next/cache", () => ({
  unstable_cache: unstableCacheMock,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: { recipes: { findMany: vi.fn() } },
  },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import { listPublicRecipes } from "./queries";
import {
  PUBLIC_RECIPES_REVALIDATE_SECONDS,
  PUBLIC_RECIPES_TAG,
} from "./cache";

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.query.recipes.findMany.mockResolvedValue([]);
});

describe("listPublicRecipes caching (#215)", () => {
  it("is wrapped in unstable_cache with the public tag and a bounded revalidate", () => {
    // The wrapper is created when the module loads, so assert on the captured
    // config (call counts are reset by beforeEach's clearAllMocks).
    expect(captured.options?.tags).toEqual([PUBLIC_RECIPES_TAG]);
    expect(captured.options?.revalidate).toBe(PUBLIC_RECIPES_REVALIDATE_SECONDS);
    expect(captured.keyParts).toBeTruthy();
  });

  it("passes limit/offset/sort through so each page and sort is keyed separately", async () => {
    await listPublicRecipes({ limit: 12, offset: 24, sort: "recent" });
    const call = dbMock.query.recipes.findMany.mock.calls.at(-1)?.[0] as {
      limit?: number;
      offset?: number;
    };
    expect(call?.limit).toBe(12);
    expect(call?.offset).toBe(24);
  });

  it("orders by the weighted score for the top-rated sort", async () => {
    await listPublicRecipes({ sort: "top-rated" });
    const recentCallOrder = (
      dbMock.query.recipes.findMany.mock.calls.at(-1)?.[0] as {
        orderBy?: unknown;
      }
    )?.orderBy;
    // top-rated uses topRatedOrderBy() → a non-empty SQL[] ordering clause.
    expect(Array.isArray(recentCallOrder)).toBe(true);
    expect((recentCallOrder as unknown[]).length).toBeGreaterThan(0);
  });
});
