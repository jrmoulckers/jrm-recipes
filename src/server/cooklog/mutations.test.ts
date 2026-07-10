import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: { transaction: transactionMock },
}));

import { type User } from "~/server/db/schema";
import { createCookLog } from "./mutations";

const cook = { id: "user_1" } as unknown as User;

type FakeTxOpts = {
  recipe?: { id: string; groupId: string | null } | null;
  isMember?: boolean;
};

function fakeTx(opts: FakeTxOpts) {
  const insertedValues: Record<string, unknown>[] = [];
  const chain = {
    values: vi.fn((v: Record<string, unknown>) => {
      insertedValues.push(v);
      return chain;
    }),
    returning: vi.fn(async () => [{ id: "cook_1", ...insertedValues[0] }]),
  };
  const tx = {
    insertedValues,
    query: {
      recipes: {
        findFirst: vi.fn(async () =>
          opts.recipe === undefined
            ? { id: "recipe_1", groupId: "group_1" }
            : opts.recipe,
        ),
      },
      groupMembers: {
        findFirst: vi.fn(async () =>
          opts.isMember ? { id: "m_1" } : undefined,
        ),
      },
    },
    insert: vi.fn(() => chain),
  };
  return tx;
}

function runWith(tx: unknown) {
  transactionMock.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCookLog share-with-family (#352)", () => {
  it("throws NOT_FOUND when the recipe is missing", async () => {
    const tx = fakeTx({ recipe: null });
    runWith(tx);
    await expect(
      createCookLog(
        { recipeId: "nope", recipeSlug: "s", shareWithFamily: true },
        cook,
      ),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("shares to the group when opted in and the cook is a member", async () => {
    const tx = fakeTx({
      recipe: { id: "recipe_1", groupId: "group_1" },
      isMember: true,
    });
    runWith(tx);
    await createCookLog(
      { recipeId: "recipe_1", recipeSlug: "s", shareWithFamily: true },
      cook,
    );
    expect(tx.insertedValues[0]?.sharedToGroupId).toBe("group_1");
  });

  it("does not share when the cook is not a member of the group", async () => {
    const tx = fakeTx({
      recipe: { id: "recipe_1", groupId: "group_1" },
      isMember: false,
    });
    runWith(tx);
    await createCookLog(
      { recipeId: "recipe_1", recipeSlug: "s", shareWithFamily: true },
      cook,
    );
    expect(tx.insertedValues[0]?.sharedToGroupId).toBeNull();
  });

  it("keeps the cook private when sharing is not requested", async () => {
    const tx = fakeTx({
      recipe: { id: "recipe_1", groupId: "group_1" },
      isMember: true,
    });
    runWith(tx);
    await createCookLog({ recipeId: "recipe_1", recipeSlug: "s" }, cook);
    expect(tx.insertedValues[0]?.sharedToGroupId).toBeNull();
    expect(tx.query.groupMembers.findFirst).not.toHaveBeenCalled();
  });

  it("does not share a recipe that has no group even if opted in", async () => {
    const tx = fakeTx({ recipe: { id: "recipe_1", groupId: null } });
    runWith(tx);
    await createCookLog(
      { recipeId: "recipe_1", recipeSlug: "s", shareWithFamily: true },
      cook,
    );
    expect(tx.insertedValues[0]?.sharedToGroupId).toBeNull();
    expect(tx.query.groupMembers.findFirst).not.toHaveBeenCalled();
  });
});
