import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      recipes: { findFirst: vi.fn() },
      reviews: { findMany: vi.fn() },
      groupMembers: { findMany: vi.fn() },
    },
    insert: vi.fn(),
  },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import { reviews, type User } from "~/server/db/schema";
import { listRecipeReviews, upsertMyReview } from "./reviews";

const author = { id: "user_1" } as User;
const publicRecipe = {
  id: "r1",
  authorId: "user_1",
  visibility: "public",
  groupId: null,
};
const privateRecipe = {
  id: "r2",
  authorId: "someone_else",
  visibility: "private",
  groupId: null,
};

/** Wire `db.insert(...).values(...).onConflictDoUpdate(...).returning()`. */
function stubInsert(rows: unknown[]) {
  const returning = vi.fn(() => Promise.resolve(rows));
  const onConflictDoUpdate = vi.fn((_config: unknown) => ({ returning }));
  const values = vi.fn((_values: unknown) => ({ onConflictDoUpdate }));
  dbMock.insert.mockReturnValue({ values });
  return { values, onConflictDoUpdate, returning };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.query.recipes.findFirst.mockResolvedValue(undefined);
  dbMock.query.reviews.findMany.mockResolvedValue([]);
  dbMock.query.groupMembers.findMany.mockResolvedValue([]);
});

describe("upsertMyReview (issue #174)", () => {
  it("upserts on the one-per-user constraint and stamps editedAt", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(publicRecipe);
    const chain = stubInsert([{ id: "rev1" }]);

    const result = await upsertMyReview("r1", author, {
      rating: 4,
      title: "Great",
      body: "Loved it",
    });

    expect(result).toEqual({ id: "rev1" });
    // Inserts the new review...
    expect(chain.values).toHaveBeenCalledWith({
      recipeId: "r1",
      userId: "user_1",
      rating: 4,
      title: "Great",
      body: "Loved it",
    });
    // ...but on a duplicate (recipe, user) edits the existing row in place.
    const conflict = chain.onConflictDoUpdate.mock.calls[0]![0] as {
      target: unknown[];
      set: { rating: number; editedAt: unknown };
    };
    expect(conflict.target).toEqual([reviews.recipeId, reviews.userId]);
    expect(conflict.set.rating).toBe(4);
    expect(conflict.set.editedAt).toBeInstanceOf(Date);
  });

  it("normalises blank title/body to null", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(publicRecipe);
    const chain = stubInsert([{ id: "rev1" }]);

    await upsertMyReview("r1", author, { rating: 5, title: "  ", body: "" });

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({ title: null, body: null }),
    );
  });

  it("rejects an out-of-range rating before touching the DB", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(publicRecipe);
    await expect(upsertMyReview("r1", author, { rating: 6 })).rejects.toThrow();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for a missing/soft-deleted recipe", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(undefined);
    await expect(
      upsertMyReview("missing", author, { rating: 5 }),
    ).rejects.toThrow("NOT_FOUND");
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when the reviewer can't view the recipe", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(privateRecipe);
    await expect(upsertMyReview("r2", author, { rating: 5 })).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});

describe("listRecipeReviews (issue #174)", () => {
  it("returns an empty page for a missing recipe without querying reviews", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(undefined);
    const page = await listRecipeReviews("missing", author);
    expect(page).toEqual({ items: [], nextOffset: null });
    expect(dbMock.query.reviews.findMany).not.toHaveBeenCalled();
  });

  it("hides reviews on a recipe the viewer can't see", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(privateRecipe);
    const page = await listRecipeReviews("r2", author);
    expect(page).toEqual({ items: [], nextOffset: null });
    expect(dbMock.query.reviews.findMany).not.toHaveBeenCalled();
  });

  it("paginates a viewable recipe's reviews and reports the next offset", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(publicRecipe);
    dbMock.query.reviews.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);

    const page = await listRecipeReviews("r1", author, { limit: 2, offset: 0 });

    expect(page.items).toHaveLength(2);
    expect(page.nextOffset).toBe(2);
    const args = dbMock.query.reviews.findMany.mock.calls[0]![0] as {
      limit: number;
      offset: number;
    };
    expect(args.limit).toBe(2);
    expect(args.offset).toBe(0);
  });

  it("stops paginating on a short (final) page", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(publicRecipe);
    dbMock.query.reviews.findMany.mockResolvedValue([{ id: "a" }]);

    const page = await listRecipeReviews("r1", author, { limit: 2, offset: 4 });

    expect(page.nextOffset).toBeNull();
  });
});
