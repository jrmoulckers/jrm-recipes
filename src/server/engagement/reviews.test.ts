import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock, findManyMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    transaction: transactionMock,
    query: { reviews: { findMany: findManyMock } },
  },
  isDbConfigured: () => true,
}));
vi.mock("~/server/recipes/queries", () => ({ canViewRecipe: vi.fn() }));
vi.mock("~/server/notifications/notify", () => ({ notify: vi.fn() }));

import { canViewRecipe } from "~/server/recipes/queries";
import { notify } from "~/server/notifications/notify";
import type { User } from "~/server/db/schema";
import { deleteReview, listReviews, upsertReview } from "./reviews";

const mockCanView = vi.mocked(canViewRecipe);
const mockNotify = vi.mocked(notify);

const user = { id: "user_1" } as unknown as User;

const recipeRow = {
  id: "recipe_1",
  title: "Sunday Sauce",
  authorId: "owner_9",
  visibility: "group",
  groupId: "group_1",
};

function fakeTx(overrides: {
  recipe?: unknown;
  existingReview?: { id: string } | null;
  reviewForDelete?: unknown;
}) {
  const chain = {
    values: vi.fn(() => chain),
    onConflictDoUpdate: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(async () => [{ id: "rev_new" }]),
  };
  return {
    chain,
    query: {
      recipes: {
        findFirst: vi.fn(async () =>
          "recipe" in overrides ? overrides.recipe : recipeRow,
        ),
      },
      reviews: {
        findFirst: vi.fn(async () =>
          overrides.reviewForDelete !== undefined
            ? overrides.reviewForDelete
            : (overrides.existingReview ?? null),
        ),
      },
    },
    insert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
  };
}

function runWith(tx: unknown) {
  transactionMock.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
}

const baseInput = {
  recipeId: "recipe_1",
  recipeSlug: "sunday-sauce",
  rating: 5,
  title: "A winner",
  body: "Kids loved it.",
  photoUrl: "",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertReview (issue #341)", () => {
  it("creates a new review and notifies the recipe author", async () => {
    const tx = fakeTx({ existingReview: null });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await upsertReview(baseInput, user);

    expect(tx.insert).toHaveBeenCalled();
    // Blank photo string is normalized to null.
    const values = (tx.chain.values.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(values.photoUrl).toBeNull();
    expect(values.rating).toBe(5);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0]![1]).toMatchObject({
      recipientId: "owner_9",
      type: "review",
      recipeId: "recipe_1",
    });
  });

  it("edits in place (editedAt) and does not re-notify", async () => {
    const tx = fakeTx({ existingReview: { id: "rev_1" } });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await upsertReview({ ...baseInput, rating: 4 }, user);

    const conflict = (
      tx.chain.onConflictDoUpdate.mock.calls[0] as unknown[]
    )[0] as {
      set: Record<string, unknown>;
    };
    expect(conflict.set.rating).toBe(4);
    expect(conflict.set.editedAt).toBeInstanceOf(Date);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("rejects a viewer who cannot see the recipe", async () => {
    runWith(fakeTx({ existingReview: null }));
    mockCanView.mockResolvedValue(false);

    await expect(upsertReview(baseInput, user)).rejects.toThrow("FORBIDDEN");
  });

  it("reports NOT_FOUND for a missing recipe", async () => {
    runWith(fakeTx({ recipe: undefined }));
    mockCanView.mockResolvedValue(true);

    await expect(upsertReview(baseInput, user)).rejects.toThrow("NOT_FOUND");
  });
});

describe("deleteReview (issue #341)", () => {
  it("lets the review author delete their own", async () => {
    const tx = fakeTx({
      reviewForDelete: {
        id: "rev_1",
        userId: user.id,
        recipe: {
          authorId: "owner_9",
          visibility: "group",
          groupId: "group_1",
        },
      },
    });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await expect(deleteReview("rev_1", user)).resolves.toBeUndefined();
    expect(tx.delete).toHaveBeenCalled();
  });

  it("forbids a non-author who is not the recipe owner", async () => {
    runWith(
      fakeTx({
        reviewForDelete: {
          id: "rev_1",
          userId: "someone_else",
          recipe: {
            authorId: "owner_9",
            visibility: "group",
            groupId: "group_1",
          },
        },
      }),
    );
    mockCanView.mockResolvedValue(true);

    await expect(deleteReview("rev_1", user)).rejects.toThrow("FORBIDDEN");
  });
});

describe("listReviews (issue #341)", () => {
  it("maps rows to review items with reviewer identity", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "rev_1",
        rating: 5,
        title: "Great",
        body: "Yum",
        photoUrl: null,
        createdAt: new Date("2024-01-01"),
        editedAt: null,
        user: { id: "u2", name: "Gran", handle: "gran", avatarUrl: null },
      },
    ]);

    const items = await listReviews("recipe_1");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "rev_1",
      rating: 5,
      author: { id: "u2", name: "Gran" },
    });
  });
});
