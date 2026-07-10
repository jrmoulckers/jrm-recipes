import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Business-logic tests for the recipe write path (issue #226), focused on the
 * transformation helpers that sit *inside* `createRecipe`'s transaction and
 * aren't exported: `scalarFields` (derived totals / column defaults / null
 * coercion), `syncTags` (canonical de-duplication), and the recipe-event
 * journal ("created" / "published"). They complement the existing
 * mutations.test.ts (slug/version races, group + ownership authz) without
 * overlapping it. Everything is driven through the public `createRecipe` with a
 * fully mocked transaction — no database.
 */

vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: { transaction: vi.fn() },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import {
  recipes,
  recipeEvents,
  recipeIngredients,
  recipeSteps,
  recipeTags,
  recipeVersions,
  tags,
  type User,
} from "~/server/db/schema";
import { recipeInput } from "./validation";
import { createRecipe } from "./mutations";

const author = { id: "user_1" } as User;

/** Resolved-and-chainable insert stand-in mirroring the fluent drizzle surface. */
function chainable(result: unknown) {
  return {
    returning: vi.fn(() => Promise.resolve(result)),
    onConflictDoNothing: vi.fn(() => Promise.resolve(undefined)),
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
}

type Recorded = Record<string, unknown[]>;

/**
 * A fake transaction that records every `insert(table).values(...)` payload,
 * keyed by table name, and echoes back tag ids so `syncTags` completes.
 */
function recordingTx() {
  const inserts: Recorded = {};
  const push = (key: string, vals: unknown) => {
    (inserts[key] ??= []).push(vals);
  };
  const keyOf = (table: unknown): string => {
    switch (table) {
      case recipes:
        return "recipes";
      case recipeIngredients:
        return "recipeIngredients";
      case recipeSteps:
        return "recipeSteps";
      case tags:
        return "tags";
      case recipeTags:
        return "recipeTags";
      case recipeEvents:
        return "recipeEvents";
      case recipeVersions:
        return "recipeVersions";
      default:
        return "unknown";
    }
  };
  let lastTagCount = 0;

  const insert = vi.fn((table: unknown) => ({
    values: (vals: unknown) => {
      const key = keyOf(table);
      push(key, vals);
      if (key === "tags") lastTagCount = (vals as unknown[]).length;
      return chainable(
        key === "recipes" ? [{ id: "r1", slug: "apple-pie" }] : undefined,
      );
    },
  }));

  const tx: Record<string, unknown> = {
    query: {
      groupMembers: { findFirst: vi.fn().mockResolvedValue(undefined) },
      recipes: { findFirst: vi.fn().mockResolvedValue(undefined) },
      tags: {
        findMany: vi.fn(() =>
          Promise.resolve(
            Array.from({ length: lastTagCount }, (_, i) => ({
              id: `tag_${i + 1}`,
            })),
          ),
        ),
      },
    },
    insert,
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ next: 1 }])),
      })),
    })),
  };
  tx.transaction = (cb: (t: unknown) => unknown) => cb(tx);
  return { tx, inserts };
}

function runCreate(overrides: Record<string, unknown>) {
  const { tx, inserts } = recordingTx();
  dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) =>
    cb(tx),
  );
  const parsed = recipeInput.parse({ title: "Apple Pie", ...overrides });
  return { promise: createRecipe(parsed, author), inserts };
}

beforeEach(() => {
  dbMock.transaction.mockReset();
});

describe("scalarFields (derived columns persisted on create)", () => {
  it("derives totalMinutes from prep + cook when it isn't supplied", async () => {
    const { promise, inserts } = runCreate({
      prepMinutes: 10,
      cookMinutes: 20,
    });
    await promise;

    expect(inserts.recipes?.[0]).toMatchObject({ totalMinutes: 30 });
  });

  it("prefers an explicit totalMinutes over the derived sum", async () => {
    const { promise, inserts } = runCreate({
      prepMinutes: 10,
      cookMinutes: 20,
      totalMinutes: 45,
    });
    await promise;

    expect(inserts.recipes?.[0]).toMatchObject({ totalMinutes: 45 });
  });

  it("leaves totalMinutes null when only one of prep/cook is known", async () => {
    const { promise, inserts } = runCreate({ prepMinutes: 10 });
    await promise;

    expect(
      (inserts.recipes?.[0] as { totalMinutes: unknown }).totalMinutes,
    ).toBeNull();
  });

  it("defaults servingsNoun to 'servings' and null-coerces empty collections", async () => {
    const { promise, inserts } = runCreate({});
    await promise;

    expect(inserts.recipes?.[0]).toMatchObject({
      servingsNoun: "servings",
      equipment: null,
      dietaryFlags: null,
      description: null,
    });
  });

  it("preserves a caller-provided servingsNoun", async () => {
    const { promise, inserts } = runCreate({ servingsNoun: "cookies" });
    await promise;

    expect(inserts.recipes?.[0]).toMatchObject({ servingsNoun: "cookies" });
  });
});

describe("syncTags (canonical de-duplication)", () => {
  it("collapses case/whitespace variants into a single tag + join row", async () => {
    const { promise, inserts } = runCreate({
      tags: ["Vegan", "vegan", " Vegan "],
    });
    await promise;

    expect(inserts.tags?.[0]).toHaveLength(1);
    expect(inserts.recipeTags?.[0]).toHaveLength(1);
  });

  it("writes no tag rows when there are no tags", async () => {
    const { promise, inserts } = runCreate({});
    await promise;

    expect(inserts.tags).toBeUndefined();
    expect(inserts.recipeTags).toBeUndefined();
  });
});

describe("recipe-event journal", () => {
  it("records a single 'created' event for a draft", async () => {
    const { promise, inserts } = runCreate({});
    await promise;

    const types = (inserts.recipeEvents ?? []).map(
      (e) => (e as { type: string }).type,
    );
    expect(types).toEqual(["created"]);
  });

  it("records both 'created' and 'published' when created as published", async () => {
    const { promise, inserts } = runCreate({ status: "published" });
    await promise;

    const types = (inserts.recipeEvents ?? []).map(
      (e) => (e as { type: string }).type,
    );
    expect(types).toEqual(["created", "published"]);
  });
});
