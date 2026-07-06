import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock } = vi.hoisted(() => ({ transactionMock: vi.fn() }));

vi.mock("~/server/db", () => ({
  db: { transaction: transactionMock },
}));
vi.mock("~/server/recipes/queries", () => ({
  canViewRecipe: vi.fn(),
}));

import { canViewRecipe } from "~/server/recipes/queries";
import type { User } from "~/server/db/schema";
import {
  createComment,
  deleteComment,
  removeRating,
  setRating,
} from "./mutations";

const mockCanView = vi.mocked(canViewRecipe);

const user = { id: "user_1" } as unknown as User;

const recipeRow = {
  id: "recipe_1",
  authorId: "owner_9",
  visibility: "group",
  groupId: "group_1",
};

/** Build a fake transaction whose recipe/comment lookups return canned rows. */
function fakeTx(overrides: {
  recipe?: unknown;
  comment?: unknown;
}): unknown {
  const chain = {
    values: vi.fn(() => chain),
    onConflictDoUpdate: vi.fn(() => chain),
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(async () => [{ id: "row_1" }]),
  };
  return {
    query: {
      recipes: {
        findFirst: vi.fn(async () =>
          "recipe" in overrides ? overrides.recipe : recipeRow,
        ),
      },
      comments: {
        findFirst: vi.fn(async () => overrides.comment ?? null),
        findMany: vi.fn(async () => []),
      },
    },
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
  };
}

/** Run the mutation's transaction callback against a fake tx. */
function runWith(tx: unknown) {
  transactionMock.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("engagement mutations enforce view permission", () => {
  it("setRating rejects a viewer who cannot see the recipe", async () => {
    runWith(fakeTx({ recipe: recipeRow }));
    mockCanView.mockResolvedValue(false);

    await expect(
      setRating(
        { recipeId: "recipe_1", recipeSlug: "sunday-sauce", value: 5 },
        user,
      ),
    ).rejects.toThrow("FORBIDDEN");
    expect(mockCanView).toHaveBeenCalledWith(recipeRow, user);
  });

  it("setRating proceeds when the viewer can see the recipe", async () => {
    const tx = fakeTx({ recipe: recipeRow });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await expect(
      setRating(
        { recipeId: "recipe_1", recipeSlug: "sunday-sauce", value: 4 },
        user,
      ),
    ).resolves.toBeDefined();
    expect((tx as { insert: ReturnType<typeof vi.fn> }).insert).toHaveBeenCalled();
  });

  it("setRating reports NOT_FOUND before checking visibility", async () => {
    runWith(fakeTx({ recipe: undefined }));
    mockCanView.mockResolvedValue(true);

    await expect(
      setRating(
        { recipeId: "missing", recipeSlug: "missing", value: 3 },
        user,
      ),
    ).rejects.toThrow("NOT_FOUND");
    expect(mockCanView).not.toHaveBeenCalled();
  });

  it("createComment rejects a viewer who cannot see the recipe", async () => {
    runWith(fakeTx({ recipe: recipeRow }));
    mockCanView.mockResolvedValue(false);

    await expect(
      createComment(
        {
          recipeId: "recipe_1",
          recipeSlug: "sunday-sauce",
          kind: "comment",
          body: "Sneaking in",
        },
        user,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("removeRating rejects a viewer who cannot see the recipe", async () => {
    runWith(fakeTx({ recipe: recipeRow }));
    mockCanView.mockResolvedValue(false);

    await expect(removeRating("recipe_1", user)).rejects.toThrow("FORBIDDEN");
  });

  it("deleteComment rejects a viewer who cannot see the recipe", async () => {
    runWith(
      fakeTx({
        comment: {
          id: "comment_1",
          userId: user.id,
          recipe: {
            authorId: "owner_9",
            visibility: "group",
            groupId: "group_1",
          },
        },
      }),
    );
    mockCanView.mockResolvedValue(false);

    await expect(deleteComment("comment_1", user)).rejects.toThrow("FORBIDDEN");
  });
});
