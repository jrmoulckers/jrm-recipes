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
  resolveGroupId,
  updateRecipe,
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

// --- Group-membership enforcement (issue #180 — IDOR on groupId) -------------

/** A tx stand-in exposing just the `group_members` lookup `resolveGroupId` does. */
function membershipTx(member: { id: string } | undefined) {
  const findFirst = vi.fn().mockResolvedValue(member);
  const tx = {
    query: { groupMembers: { findFirst } },
  } as unknown as Parameters<typeof resolveGroupId>[0];
  return { tx, findFirst };
}

describe("resolveGroupId (group-membership guard)", () => {
  it("keeps a groupId the author is a member of", async () => {
    const { tx, findFirst } = membershipTx({ id: "gm_1" });
    const parsed = recipeInput.parse({
      title: "Apple Pie",
      visibility: "group",
      groupId: "grp_1",
    });

    await expect(resolveGroupId(tx, parsed, author)).resolves.toBe("grp_1");
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects a group-visibility recipe assigned to a group the author isn't in", async () => {
    const { tx } = membershipTx(undefined);
    const parsed = recipeInput.parse({
      title: "Apple Pie",
      visibility: "group",
      groupId: "grp_x",
    });

    await expect(resolveGroupId(tx, parsed, author)).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("nulls a stray groupId on a non-group recipe when the author isn't a member", async () => {
    const { tx } = membershipTx(undefined);
    const parsed = recipeInput.parse({
      title: "Apple Pie",
      visibility: "private",
      groupId: "grp_x",
    });

    await expect(resolveGroupId(tx, parsed, author)).resolves.toBeNull();
  });

  it("keeps a groupId a member attaches to a non-group recipe", async () => {
    const { tx } = membershipTx({ id: "gm_1" });
    const parsed = recipeInput.parse({
      title: "Apple Pie",
      visibility: "private",
      groupId: "grp_1",
    });

    await expect(resolveGroupId(tx, parsed, author)).resolves.toBe("grp_1");
  });

  it("returns null without a membership lookup when no groupId is set", async () => {
    const { tx, findFirst } = membershipTx({ id: "gm_1" });
    const parsed = recipeInput.parse({ title: "Apple Pie" });

    await expect(resolveGroupId(tx, parsed, author)).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

/**
 * A resolved-then-chainable stand-in: `await tx.insert(t).values(v)` resolves,
 * while `tx.insert(t).values(v).returning(...)` / `.onConflictDoNothing()` also
 * work — matching the fluent drizzle surface the mutation code walks.
 */
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

/** Fake tx that drives a full `createRecipe` transaction without a database. */
function createTx(opts: { member: boolean }) {
  const recipeValues = vi.fn();
  const insert = vi.fn((table: unknown) => ({
    values: (vals: unknown) => {
      if (table === recipes) recipeValues(vals);
      return chainable(table === recipes ? [{ id: "r1", slug: "apple-pie" }] : undefined);
    },
  }));
  const tx = {
    query: {
      groupMembers: {
        findFirst: vi.fn().mockResolvedValue(opts.member ? { id: "gm_1" } : undefined),
      },
      recipes: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
    insert,
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([{ next: 1 }])) })),
    })),
  };
  return { tx, insert, recipeValues };
}

describe("createRecipe group-membership enforcement", () => {
  it("persists a groupId the author belongs to", async () => {
    const { tx, recipeValues } = createTx({ member: true });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const parsed = recipeInput.parse({
      title: "Apple Pie",
      visibility: "group",
      groupId: "grp_1",
    });

    const result = await createRecipe(parsed, author);

    expect(result).toEqual({ id: "r1", slug: "apple-pie" });
    expect(recipeValues).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "grp_1", visibility: "group" }),
    );
  });

  it("rejects (FORBIDDEN) and persists nothing when the author isn't a member", async () => {
    const { tx, insert } = createTx({ member: false });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const parsed = recipeInput.parse({
      title: "Apple Pie",
      visibility: "group",
      groupId: "grp_x",
    });

    await expect(createRecipe(parsed, author)).rejects.toThrow("FORBIDDEN");
    expect(insert).not.toHaveBeenCalled();
  });

  it("nulls a stray groupId on a private recipe from a non-member", async () => {
    const { tx, recipeValues } = createTx({ member: false });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const parsed = recipeInput.parse({
      title: "Apple Pie",
      visibility: "private",
      groupId: "grp_x",
    });

    await createRecipe(parsed, author);

    expect(recipeValues).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: null, visibility: "private" }),
    );
  });
});

/** Fake tx that drives a full `updateRecipe` transaction without a database. */
function updateTx(opts: { member: boolean }) {
  const setValues = vi.fn();
  const update = vi.fn(() => ({
    set: (vals: unknown) => {
      setValues(vals);
      return { where: vi.fn(() => Promise.resolve(undefined)) };
    },
  }));
  const tx = {
    query: {
      groupMembers: {
        findFirst: vi.fn().mockResolvedValue(opts.member ? { id: "gm_1" } : undefined),
      },
      recipes: {
        findFirst: vi.fn().mockResolvedValue({
          id: "r1",
          slug: "apple-pie",
          publishedAt: null,
          status: "draft",
        }),
      },
    },
    update,
    insert: vi.fn(() => ({ values: () => chainable(undefined) })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([{ next: 1 }])) })),
    })),
  };
  return { tx, update, setValues };
}

describe("updateRecipe group-membership enforcement", () => {
  it("allows an update assigning a group the author belongs to", async () => {
    const { tx, setValues } = updateTx({ member: true });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const parsed = recipeInput.parse({
      title: "Apple Pie",
      visibility: "group",
      groupId: "grp_1",
    });

    const result = await updateRecipe("r1", parsed, author);

    expect(result).toEqual({ id: "r1", slug: "apple-pie" });
    expect(setValues).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "grp_1" }),
    );
  });

  it("rejects (FORBIDDEN) an update assigning a group the author isn't in", async () => {
    const { tx, update } = updateTx({ member: false });
    dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const parsed = recipeInput.parse({
      title: "Apple Pie",
      visibility: "group",
      groupId: "grp_x",
    });

    await expect(updateRecipe("r1", parsed, author)).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(update).not.toHaveBeenCalled();
  });
});
