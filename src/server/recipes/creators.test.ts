import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dbMock, hiddenMock, notifyMock, uniqueSlugMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      recipes: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
      recipeCreators: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    transaction: vi.fn(),
    delete: vi.fn(),
  },
  hiddenMock: vi.fn(),
  notifyMock: vi.fn(),
  uniqueSlugMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({ db: dbMock, isDbConfigured: () => true }));
vi.mock("~/server/moderation/blocks", () => ({
  getHiddenAuthorIds: hiddenMock,
}));
vi.mock("~/server/notifications/notify", () => ({ notify: notifyMock }));
vi.mock("./mutations", () => ({
  uniqueSlug: uniqueSlugMock,
  // Pass-through: the retry wrapper's own behaviour is covered in mutations.test.
  withSlugConflictRetry: (op: () => Promise<unknown>) => op(),
}));

import {
  acceptRecipeCreatorInvite,
  declineRecipeCreatorInvite,
  inviteRecipeCreator,
  leaveRecipeAsCreator,
  removeRecipeCreator,
} from "./creators";

const OWNER = "user_owner";
const INVITEE = "user_invitee";
const RECIPE = {
  id: "rec_1",
  slug: "apple-pie",
  title: "Apple Pie",
  authorId: OWNER,
  deletedAt: null,
  author: { slug: "ada" },
};

/** Capture what a mutation wrote, with a chainable tx double. */
function txDouble() {
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  let deleteResult: unknown[] = [];
  let updateResult: unknown[] = [{ id: "rc_1" }];

  const tx = {
    query: { recipeCreators: { findFirst: vi.fn() } },
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v);
        return { returning: () => Promise.resolve([{ id: "rc_1" }]) };
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        updated.push(v);
        return { where: () => ({ returning: () => updateResult }) };
      },
    }),
    delete: () => ({
      where: () => ({ returning: () => deleteResult }),
    }),
  };

  dbMock.transaction.mockImplementation((cb: (t: unknown) => unknown) =>
    Promise.resolve(cb(tx)),
  );

  return {
    tx,
    inserted,
    updated,
    setDeleteResult: (rows: unknown[]) => {
      deleteResult = rows;
    },
    setUpdateResult: (rows: unknown[]) => {
      updateResult = rows;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hiddenMock.mockResolvedValue(new Set<string>());
  uniqueSlugMock.mockResolvedValue("apple-pie");
  dbMock.query.recipes.findFirst.mockResolvedValue(RECIPE);
  dbMock.query.users.findFirst.mockResolvedValue({
    id: INVITEE,
    deletedAt: null,
    slug: "bo",
  });
  dbMock.query.recipeCreators.findFirst.mockResolvedValue(undefined);
});

describe("inviteRecipeCreator (owner consent)", () => {
  it("writes a pending row that carries no slug", async () => {
    // The security property: an invitation grants nothing. The DB CHECK forbids
    // a slug on a pending row, so writing one here would fail loudly — this
    // asserts the mutation never tries.
    const { inserted } = txDouble();

    await inviteRecipeCreator(RECIPE.id, OWNER, INVITEE);

    expect(inserted).toEqual([
      {
        recipeId: RECIPE.id,
        userId: INVITEE,
        invitedById: OWNER,
        status: "pending",
      },
    ]);
    expect(inserted[0]).not.toHaveProperty("slug");
  });

  it("notifies the invitee", async () => {
    txDouble();

    await inviteRecipeCreator(RECIPE.id, OWNER, INVITEE);

    expect(notifyMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipientId: INVITEE,
        actorId: OWNER,
        type: "recipe_creator_invite",
        recipeId: RECIPE.id,
      }),
    );
  });

  it("refuses a non-owner, and says NOT_FOUND rather than FORBIDDEN", async () => {
    // Reporting FORBIDDEN would confirm the recipe exists to anyone who guessed
    // an id, so a non-owner gets the same answer as for a missing recipe.
    txDouble();

    await expect(
      inviteRecipeCreator(RECIPE.id, "user_stranger", INVITEE),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("refuses to invite the owner to their own recipe", async () => {
    txDouble();

    await expect(inviteRecipeCreator(RECIPE.id, OWNER, OWNER)).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("refuses a deleted or unknown target", async () => {
    txDouble();
    dbMock.query.users.findFirst.mockResolvedValue(undefined);

    await expect(
      inviteRecipeCreator(RECIPE.id, OWNER, INVITEE),
    ).rejects.toThrow("USER_NOT_FOUND");
  });

  it("refuses when either party has blocked the other", async () => {
    txDouble();
    hiddenMock.mockResolvedValue(new Set([INVITEE]));

    await expect(
      inviteRecipeCreator(RECIPE.id, OWNER, INVITEE),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("refuses on a soft-deleted recipe", async () => {
    txDouble();
    dbMock.query.recipes.findFirst.mockResolvedValue(undefined);

    await expect(
      inviteRecipeCreator(RECIPE.id, OWNER, INVITEE),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("reports an existing invitation rather than stacking rows", async () => {
    txDouble();
    dbMock.query.recipeCreators.findFirst.mockResolvedValue({
      id: "rc_1",
      status: "pending",
    });

    await expect(
      inviteRecipeCreator(RECIPE.id, OWNER, INVITEE),
    ).rejects.toThrow("ALREADY_INVITED");
  });
});

describe("acceptRecipeCreatorInvite (invitee consent)", () => {
  it("allocates the slug in the invitee's namespace, not the owner's", async () => {
    // The whole point of per-creator namespaces: perturbation happens inside
    // the accepting user's namespace and never disturbs the owner's slug.
    const { tx, updated } = txDouble();
    tx.query.recipeCreators.findFirst.mockResolvedValue({
      id: "rc_1",
      status: "pending",
    });
    uniqueSlugMock.mockResolvedValue("apple-pie-2ab");

    const result = await acceptRecipeCreatorInvite(RECIPE.id, INVITEE);

    expect(uniqueSlugMock).toHaveBeenCalledWith(
      expect.anything(),
      INVITEE,
      "apple-pie",
    );
    expect(result.slug).toBe("apple-pie-2ab");
    expect(updated[0]).toMatchObject({
      status: "accepted",
      slug: "apple-pie-2ab",
    });
    expect(updated[0]!.acceptedAt).toBeInstanceOf(Date);
  });

  it("returns the owner's namespace so the caller can bust the canonical path", async () => {
    // The owner's page gains a co-creator in its byline on accept, so the
    // caller needs the owner's cook/slug pair. Returning a slug-less stub would
    // silently degrade the fan-out to `/recipes/<id>`, which nothing links to.
    const { tx } = txDouble();
    tx.query.recipeCreators.findFirst.mockResolvedValue({
      id: "rc_1",
      status: "pending",
    });

    const result = await acceptRecipeCreatorInvite(RECIPE.id, INVITEE);

    expect(result.recipe).toEqual({
      id: RECIPE.id,
      slug: RECIPE.slug,
      cook: "ada",
    });
  });

  it("bases the slug on the title, not the owner's perturbed slug", async () => {
    const { tx } = txDouble();
    tx.query.recipeCreators.findFirst.mockResolvedValue({
      id: "rc_1",
      status: "pending",
    });
    dbMock.query.recipes.findFirst.mockResolvedValue({
      ...RECIPE,
      slug: "apple-pie-9zz",
    });

    await acceptRecipeCreatorInvite(RECIPE.id, INVITEE);

    expect(uniqueSlugMock).toHaveBeenCalledWith(
      expect.anything(),
      INVITEE,
      "apple-pie",
    );
  });

  it("refuses when there is no invitation", async () => {
    const { tx } = txDouble();
    tx.query.recipeCreators.findFirst.mockResolvedValue(undefined);

    await expect(acceptRecipeCreatorInvite(RECIPE.id, INVITEE)).rejects.toThrow(
      "NOT_FOUND",
    );
  });

  it("refuses to re-accept", async () => {
    const { tx } = txDouble();
    tx.query.recipeCreators.findFirst.mockResolvedValue({
      id: "rc_1",
      status: "accepted",
    });

    await expect(acceptRecipeCreatorInvite(RECIPE.id, INVITEE)).rejects.toThrow(
      "ALREADY_ACCEPTED",
    );
  });

  it("loses cleanly when a concurrent accept already won", async () => {
    // The UPDATE is guarded on `status = 'pending'`, so the loser of a race
    // updates zero rows rather than allocating a second slug.
    const { tx, setUpdateResult } = txDouble();
    tx.query.recipeCreators.findFirst.mockResolvedValue({
      id: "rc_1",
      status: "pending",
    });
    setUpdateResult([]);

    await expect(acceptRecipeCreatorInvite(RECIPE.id, INVITEE)).rejects.toThrow(
      "NOT_PENDING",
    );
  });

  it("notifies the owner", async () => {
    const { tx } = txDouble();
    tx.query.recipeCreators.findFirst.mockResolvedValue({
      id: "rc_1",
      status: "pending",
    });

    await acceptRecipeCreatorInvite(RECIPE.id, INVITEE);

    expect(notifyMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipientId: OWNER,
        actorId: INVITEE,
        type: "recipe_creator_accepted",
      }),
    );
  });
});

describe("declineRecipeCreatorInvite", () => {
  it("deletes the pending row", async () => {
    dbMock.delete.mockReturnValue({
      where: () => ({ returning: () => Promise.resolve([{ id: "rc_1" }]) }),
    });

    await expect(
      declineRecipeCreatorInvite(RECIPE.id, INVITEE),
    ).resolves.toBeUndefined();
  });

  it("refuses when nothing was pending", async () => {
    dbMock.delete.mockReturnValue({
      where: () => ({ returning: () => Promise.resolve([]) }),
    });

    await expect(
      declineRecipeCreatorInvite(RECIPE.id, INVITEE),
    ).rejects.toThrow("NOT_PENDING");
  });
});

describe("removeRecipeCreator (revocation)", () => {
  it("returns the freed namespace so its cached page can be purged", async () => {
    // The row is gone by the time the caller revalidates, so the path it used
    // to serve has to be handed back — otherwise the revoked page keeps being
    // served from the App Router cache.
    const { setDeleteResult } = txDouble();
    setDeleteResult([{ slug: "apple-pie", status: "accepted" }]);
    dbMock.query.users.findFirst.mockResolvedValue({
      id: INVITEE,
      deletedAt: null,
      slug: "bo",
    });

    const result = await removeRecipeCreator(RECIPE.id, OWNER, INVITEE);

    expect(result.removed).toEqual({ cook: "bo", slug: "apple-pie" });
    expect(result.recipe).toEqual({
      id: RECIPE.id,
      slug: "apple-pie",
      cook: "ada",
    });
  });

  it("writes no alias for the freed slug", async () => {
    // Deliberate divergence from the alias-permanence rule: an ex-creator alias
    // would point across a revoked relationship. The transaction must only
    // delete — never insert.
    const { tx, setDeleteResult } = txDouble();
    setDeleteResult([{ slug: "apple-pie", status: "accepted" }]);
    const insertSpy = vi.spyOn(tx, "insert");

    await removeRecipeCreator(RECIPE.id, OWNER, INVITEE);

    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("reports no namespace for a rescinded pending invitation", async () => {
    const { setDeleteResult } = txDouble();
    setDeleteResult([{ slug: null, status: "pending" }]);

    const result = await removeRecipeCreator(RECIPE.id, OWNER, INVITEE);

    expect(result.removed).toBeNull();
  });

  it("refuses a non-owner", async () => {
    txDouble();

    await expect(
      removeRecipeCreator(RECIPE.id, "user_stranger", INVITEE),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("refuses to remove the owner from their own recipe", async () => {
    // The zero-creator state must stay unreachable: the owner is the NOT NULL
    // `authorId`, not a removable row.
    txDouble();

    await expect(removeRecipeCreator(RECIPE.id, OWNER, OWNER)).rejects.toThrow(
      "FORBIDDEN",
    );
  });
});

describe("leaveRecipeAsCreator", () => {
  it("lets a creator step down and frees their slug", async () => {
    const { setDeleteResult } = txDouble();
    setDeleteResult([{ slug: "apple-pie", status: "accepted" }]);

    const result = await leaveRecipeAsCreator(RECIPE.id, INVITEE);

    expect(result.removed).toEqual({ cook: "bo", slug: "apple-pie" });
  });

  it("refuses to let the owner leave", async () => {
    txDouble();

    await expect(leaveRecipeAsCreator(RECIPE.id, OWNER)).rejects.toThrow(
      "OWNER_CANT_LEAVE",
    );
  });

  it("refuses when there is no row to delete", async () => {
    const { setDeleteResult } = txDouble();
    setDeleteResult([]);

    await expect(leaveRecipeAsCreator(RECIPE.id, INVITEE)).rejects.toThrow(
      "NOT_FOUND",
    );
  });
});
