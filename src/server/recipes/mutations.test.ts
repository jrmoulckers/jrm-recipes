import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

vi.mock("server-only", () => ({}));

// Only the transaction entrypoint is exercised here — the retry wrapper lives
// *outside* the transaction callback, so a mocked `transaction` lets us drive
// the collision/retry paths without a real database.
const { dbMock } = vi.hoisted(() => ({
  dbMock: { transaction: vi.fn() },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import { recipes, type User } from "~/server/db/schema";
import { recipeInput } from "./validation";
import {
  createRecipe,
  forkRecipe,
  isSlugConflict,
  uniqueSlug,
} from "./mutations";

const author = { id: "user_1" } as User;
const input = recipeInput.parse({ title: "Apple Pie" });

/** A Postgres unique-violation on the recipes.slug constraint. */
function slugConflict(): Error {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "recipes_slug_uq"',
    ),
    { code: "23505", constraint: "recipes_slug_uq" },
  );
}

/** Minimal transaction stand-in exposing just the surface `uniqueSlug` reads. */
function fakeTx(findFirst: ReturnType<typeof vi.fn>) {
  return { query: { recipes: { findFirst } } } as unknown as Parameters<
    typeof uniqueSlug
  >[0];
}

beforeEach(() => {
  dbMock.transaction.mockReset();
});

describe("recipes.slug unique constraint (schema)", () => {
  it("is enforced at the database level, not just in app code", () => {
    const { uniqueConstraints, indexes } = getTableConfig(recipes);

    const slugUq = uniqueConstraints.find((u) => u.name === "recipes_slug_uq");
    expect(slugUq).toBeDefined();
    expect(slugUq?.columns.map((c) => c.name)).toEqual(["slug"]);

    // The old non-unique index was replaced by the unique constraint (whose
    // btree index still backs slug lookups), so getRecipe-by-slug resolves at
    // most one row.
    expect(indexes.some((i) => i.config.name === "recipes_slug_idx")).toBe(
      false,
    );
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug when it is free", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const slug = await uniqueSlug(fakeTx(findFirst), "apple-pie");
    expect(slug).toBe("apple-pie");
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("derives a distinct slug when the base is already taken", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "existing" }) // base taken
      .mockResolvedValueOnce(undefined); // perturbed candidate is free
    const slug = await uniqueSlug(fakeTx(findFirst), "apple-pie");
    expect(slug).not.toBe("apple-pie");
    expect(slug.startsWith("apple-pie-")).toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("excludes the given id so a recipe never collides with itself", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const slug = await uniqueSlug(fakeTx(findFirst), "apple-pie", "self_id");
    expect(slug).toBe("apple-pie");
  });
});

describe("isSlugConflict", () => {
  it("matches a unique-violation on the slug constraint", () => {
    expect(isSlugConflict(slugConflict())).toBe(true);
  });

  it("matches when only the message carries the constraint name", () => {
    expect(
      isSlugConflict({
        code: "23505",
        message: 'violates unique constraint "recipes_slug_uq"',
      }),
    ).toBe(true);
  });

  it("unwraps a single cause level", () => {
    expect(isSlugConflict({ cause: slugConflict() })).toBe(true);
  });

  it("ignores unique violations on other constraints", () => {
    expect(
      isSlugConflict({ code: "23505", constraint: "ratings_recipe_user_uq" }),
    ).toBe(false);
  });

  it("ignores non-unique-violation errors and non-objects", () => {
    expect(isSlugConflict({ code: "23503" })).toBe(false); // fk violation
    expect(isSlugConflict(new Error("boom"))).toBe(false);
    expect(isSlugConflict(null)).toBe(false);
    expect(isSlugConflict("nope")).toBe(false);
  });
});

describe("createRecipe slug-conflict resilience", () => {
  it("retries the whole transaction on a slug collision, then succeeds", async () => {
    const created = { id: "r1", slug: "apple-pie-2" };
    dbMock.transaction
      .mockRejectedValueOnce(slugConflict())
      .mockResolvedValueOnce(created);

    const result = await createRecipe(input, author);

    expect(result).toEqual(created);
    expect(dbMock.transaction).toHaveBeenCalledTimes(2);
  });

  it("does not retry on an unrelated error", async () => {
    dbMock.transaction.mockRejectedValueOnce(new Error("boom"));

    await expect(createRecipe(input, author)).rejects.toThrow("boom");
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
  });

  it("gives up after the max attempts if the collision never clears", async () => {
    dbMock.transaction.mockRejectedValue(slugConflict());

    await expect(createRecipe(input, author)).rejects.toMatchObject({
      code: "23505",
    });
    expect(dbMock.transaction).toHaveBeenCalledTimes(5);
  });
});

describe("forkRecipe slug-conflict resilience", () => {
  it("retries the whole transaction on a slug collision, then succeeds", async () => {
    const created = { id: "f1", slug: "apple-pie-adaptation-2" };
    dbMock.transaction
      .mockRejectedValueOnce(slugConflict())
      .mockResolvedValueOnce(created);

    const result = await forkRecipe("apple-pie", author);

    expect(result).toEqual(created);
    expect(dbMock.transaction).toHaveBeenCalledTimes(2);
  });
});
