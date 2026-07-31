import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Verifies the write-time food-graph link (foodId) is populated on every
 * ingredient row for both the create and update paths, using the shared
 * `recordingTx` harness style from mutations-logic.test.ts (no database). The
 * resolver itself is mocked here — its behavior is covered by
 * `src/lib/food-resolve.test.ts` and `src/server/db/resolve-food.test.ts`; this
 * asserts only the wiring in `insertChildren`.
 */

vi.mock("server-only", () => ({}));

const { dbMock, resolveMock } = vi.hoisted(() => ({
  dbMock: { transaction: vi.fn() },
  resolveMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

vi.mock("~/server/db/resolve-food", () => ({
  resolveFoodIds: resolveMock,
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
import { createRecipe, updateRecipe } from "./mutations";

const author = { id: "user_1" } as User;

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

/** Records every `insert(table).values(...)`, keyed by table name. */
function recordingTx(existing?: Record<string, unknown>) {
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

  const insert = vi.fn((table: unknown) => ({
    values: (vals: unknown) => {
      const key = keyOf(table);
      push(key, vals);
      return chainable(
        key === "recipes" ? [{ id: "r1", slug: "apple-pie" }] : undefined,
      );
    },
  }));

  const tx: Record<string, unknown> = {
    query: {
      groupMembers: { findFirst: vi.fn().mockResolvedValue(undefined) },
      recipes: { findFirst: vi.fn().mockResolvedValue(existing) },
      tags: { findMany: vi.fn(() => Promise.resolve([])) },
    },
    insert,
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })),
    })),
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

const twoIngredients = [
  { item: "2 cloves garlic, minced" },
  { item: "mystery space dust" },
];

beforeEach(() => {
  dbMock.transaction.mockReset();
  resolveMock.mockReset();
  // Resolve garlic to a node, leave the nonsense line unresolved (null).
  resolveMock.mockImplementation((items: string[]) =>
    Promise.resolve(
      items.map((it) => (it.includes("garlic") ? "food_garlic" : null)),
    ),
  );
});

describe("insertChildren wires foodId onto ingredient rows", () => {
  it("populates foodId on create (best-effort, null when unresolved)", async () => {
    const { tx, inserts } = recordingTx();
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) =>
      cb(tx),
    );

    await createRecipe(
      recipeInput.parse({ title: "Apple Pie", ingredients: twoIngredients }),
      author,
    );

    expect(resolveMock).toHaveBeenCalledWith(
      ["2 cloves garlic, minced", "mystery space dust"],
      tx,
    );
    const rows = inserts.recipeIngredients?.[0] as Array<{
      item: string;
      foodId: string | null;
    }>;
    expect(rows.map((r) => ({ item: r.item, foodId: r.foodId }))).toEqual([
      { item: "2 cloves garlic, minced", foodId: "food_garlic" },
      { item: "mystery space dust", foodId: null },
    ]);
  });

  it("populates foodId on update", async () => {
    const { tx, inserts } = recordingTx({
      id: "r1",
      slug: "apple-pie",
      publishedAt: null,
      status: "draft",
      visibility: "private",
    });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) =>
      cb(tx),
    );

    await updateRecipe(
      "r1",
      recipeInput.parse({ title: "Apple Pie", ingredients: twoIngredients }),
      author,
    );

    const rows = inserts.recipeIngredients?.[0] as Array<{
      item: string;
      foodId: string | null;
    }>;
    expect(rows.map((r) => r.foodId)).toEqual(["food_garlic", null]);
  });
});
