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
  applySuggestion,
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
    chain,
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

const ownerUser = { id: "owner_9" } as unknown as User;

/** An open suggestion owned by `owner_9`, proposed by contributor `contrib_3`. */
const suggestionRow = {
  id: "sugg_1",
  kind: "suggestion",
  body: "Add a bay leaf",
  userId: "contrib_3",
  appliedAt: null,
  recipe: {
    id: "recipe_1",
    authorId: "owner_9",
    visibility: "group",
    groupId: "group_1",
    notes: "Simmer low.",
  },
  user: { name: "Cousin Rae", handle: "rae" },
};

const applyArgs = { recipeId: "recipe_1", suggestionId: "sugg_1" };

/** Read the argument object of the first chain call whose payload has `key`. */
function payloadWith(
  calls: unknown[][],
  key: string,
): Record<string, unknown> | undefined {
  const match = calls.find(
    (call) =>
      typeof call[0] === "object" &&
      call[0] !== null &&
      key in (call[0] as Record<string, unknown>),
  );
  return match?.[0] as Record<string, unknown> | undefined;
}

describe("applySuggestion folds a suggestion into the recipe (owner-only)", () => {
  it("merges the suggestion into notes, marks it applied, and records the milestone", async () => {
    const tx = fakeTx({ comment: suggestionRow });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await applySuggestion(applyArgs, ownerUser);

    const chain = (tx as { chain: { set: ReturnType<typeof vi.fn>; values: ReturnType<typeof vi.fn> } })
      .chain;

    // (b) the change is applied INTO the recipe — merged into notes, credited.
    const recipeUpdate = payloadWith(chain.set.mock.calls, "notes");
    expect(recipeUpdate?.notes).toBe(
      "Simmer low.\n\nAdd a bay leaf — suggested by Cousin Rae",
    );

    // (d) the suggestion is marked applied (and resolved) so it isn't reoffered.
    const commentUpdate = payloadWith(chain.set.mock.calls, "appliedAt");
    expect(commentUpdate?.appliedAt).toBeInstanceOf(Date);
    expect(commentUpdate?.resolvedAt).toBeInstanceOf(Date);

    // (c) a timeline event attributes the contributor, not the applying owner.
    const event = payloadWith(chain.values.mock.calls, "type");
    expect(event).toMatchObject({
      recipeId: "recipe_1",
      actorId: "contrib_3",
      type: "suggestion_applied",
      note: "Add a bay leaf",
    });
  });

  it("rejects a non-owner even when they can view the recipe (FORBIDDEN)", async () => {
    runWith(
      fakeTx({
        comment: {
          ...suggestionRow,
          recipe: { ...suggestionRow.recipe, authorId: "someone_else" },
        },
      }),
    );
    mockCanView.mockResolvedValue(true);

    await expect(applySuggestion(applyArgs, ownerUser)).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("rejects a viewer who cannot see the recipe (FORBIDDEN)", async () => {
    runWith(fakeTx({ comment: suggestionRow }));
    mockCanView.mockResolvedValue(false);

    await expect(applySuggestion(applyArgs, ownerUser)).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(mockCanView).toHaveBeenCalledWith(suggestionRow.recipe, ownerUser);
  });

  it("refuses to apply a plain comment (FORBIDDEN)", async () => {
    runWith(fakeTx({ comment: { ...suggestionRow, kind: "comment" } }));
    mockCanView.mockResolvedValue(true);

    await expect(applySuggestion(applyArgs, ownerUser)).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("does not re-apply an already applied suggestion (ALREADY_APPLIED)", async () => {
    runWith(fakeTx({ comment: { ...suggestionRow, appliedAt: new Date() } }));
    mockCanView.mockResolvedValue(true);

    await expect(applySuggestion(applyArgs, ownerUser)).rejects.toThrow(
      "ALREADY_APPLIED",
    );
  });

  it("reports NOT_FOUND before checking visibility when the suggestion is gone", async () => {
    runWith(fakeTx({ comment: null }));
    mockCanView.mockResolvedValue(true);

    await expect(applySuggestion(applyArgs, ownerUser)).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(mockCanView).not.toHaveBeenCalled();
  });
});
