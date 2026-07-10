import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { type SQL } from "drizzle-orm";

const { transactionMock } = vi.hoisted(() => ({ transactionMock: vi.fn() }));

vi.mock("~/server/db", () => ({
  db: { transaction: transactionMock },
}));
vi.mock("~/server/recipes/queries", () => ({
  canViewRecipe: vi.fn(),
}));

import { canViewRecipe } from "~/server/recipes/queries";
import { comments, type User } from "~/server/db/schema";
import {
  applySuggestion,
  createComment,
  deleteComment,
  removeRating,
  resolveComment,
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
  /** Full recipe (with ingredients/steps/tags) returned to the #63 snapshot. */
  fullRecipe?: unknown;
  comment?: unknown;
  /** The caller's existing rating row, if any (drives aggregate deltas). */
  existingRating?: { value: number } | null;
  /** Group members returned for mention resolution (issue #340). */
  members?: unknown[];
}): unknown {
  const chain = {
    values: vi.fn(() => chain),
    onConflictDoUpdate: vi.fn(() => chain),
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(async () => [{ id: "row_1" }]),
  };
  const tx: Record<string, unknown> = {
    chain,
    query: {
      recipes: {
        findFirst: vi.fn(async () =>
          "fullRecipe" in overrides
            ? overrides.fullRecipe
            : "recipe" in overrides
              ? overrides.recipe
              : recipeRow,
        ),
      },
      ratings: {
        findFirst: vi.fn(async () => overrides.existingRating ?? null),
      },
      comments: {
        findFirst: vi.fn(async () => overrides.comment ?? null),
        findMany: vi.fn(async () => []),
      },
      groupMembers: {
        findMany: vi.fn(async () => overrides.members ?? []),
      },
    },
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    // journal() (recipes/mutations) allocates the version number in a SAVEPOINT
    // (tx.transaction) after reading max+1 via select(); model both here so the
    // #63 snapshot path can run against the fake tx.
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(async () => [{ next: 1 }]) })),
    })),
  };
  tx.transaction = vi.fn((cb: (t: unknown) => unknown) => cb(tx));
  return tx;
}

/** Render a Drizzle SQL fragment's bound params (no DB needed). */
const dialect = new PgDialect({ casing: "snake_case" });
function paramsOf(fragment: unknown): unknown[] {
  return dialect.sqlToQuery(fragment as SQL).params;
}

/** Run the mutation's transaction callback against a fake tx. */
function runWith(tx: unknown) {
  transactionMock.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("comments.parentId self-referential foreign key (schema)", () => {
  it("references comments.id with ON DELETE cascade so replies can't outlive their parent", () => {
    const { foreignKeys } = getTableConfig(comments);

    // The thread link is a real FK now (not a bare column): parentId -> id.
    const parentFk = foreignKeys.find((fk) =>
      fk.reference().columns.includes(comments.parentId),
    );
    expect(parentFk).toBeDefined();

    const ref = parentFk!.reference();
    // Self-referential: the target column is comments.id on the same table.
    expect(ref.foreignColumns).toContain(comments.id);

    // Deleting a parent comment cascades to its replies (thread hygiene), so a
    // reply can never be left rooted at a missing parent.
    expect(parentFk!.onDelete).toBe("cascade");
  });
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
    expect(
      (tx as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalled();
  });

  it("setRating reports NOT_FOUND before checking visibility", async () => {
    runWith(fakeTx({ recipe: undefined }));
    mockCanView.mockResolvedValue(true);

    await expect(
      setRating({ recipeId: "missing", recipeSlug: "missing", value: 3 }, user),
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

describe("createComment emits social notifications (#340/#348)", () => {
  const commentRecipe = {
    id: "recipe_1",
    title: "Sunday Sauce",
    authorId: "owner_9",
    visibility: "group",
    groupId: "group_1",
    author: {
      id: "owner_9",
      name: "Owner",
      handle: "owner",
      avatarUrl: null,
    },
  };
  const members = [
    { user: { id: "u_gran", name: "Gran", handle: "gran", avatarUrl: null } },
    { user: { id: "user_1", name: "Me", handle: "me", avatarUrl: null } },
  ];

  /** Notification payloads captured from the tx's insert().values() calls. */
  function notifiedTypes(tx: unknown) {
    const chain = (tx as { chain: { values: ReturnType<typeof vi.fn> } }).chain;
    return chain.values.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .filter((v) => v && typeof v.type === "string" && "recipientId" in v);
  }

  it("notifies mentioned members but never the author of the comment", async () => {
    const tx = fakeTx({ recipe: commentRecipe, members });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await createComment(
      {
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        kind: "comment",
        body: "Hey @gran and @me — thoughts? (@me is myself)",
      },
      user,
    );

    const notes = notifiedTypes(tx);
    // @gran resolves and is notified; @me is the actor -> notify() no-ops.
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      recipientId: "u_gran",
      type: "mention",
      recipeId: "recipe_1",
      context: "Sunday Sauce",
    });
  });

  it("ignores unknown @handles", async () => {
    const tx = fakeTx({ recipe: commentRecipe, members });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await createComment(
      {
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        kind: "comment",
        body: "cc @nobody",
      },
      user,
    );

    expect(notifiedTypes(tx)).toHaveLength(0);
  });

  it("notifies the parent author of a reply", async () => {
    const tx = fakeTx({
      recipe: commentRecipe,
      comment: { id: "parent_1", userId: "u_gran" },
      members,
    });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await createComment(
      {
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        parentId: "parent_1",
        kind: "comment",
        body: "Thanks!",
      },
      user,
    );

    const notes = notifiedTypes(tx);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      recipientId: "u_gran",
      type: "comment_reply",
    });
  });
});

describe("createComment persists an anchor for suggestions (#346)", () => {
  const commentRecipe = {
    id: "recipe_1",
    title: "Sunday Sauce",
    authorId: "owner_9",
    visibility: "group",
    groupId: "group_1",
  };

  /** The payload passed to the comment insert (first values() call). */
  function insertedComment(tx: unknown) {
    const chain = (tx as { chain: { values: ReturnType<typeof vi.fn> } }).chain;
    return (chain.values.mock.calls as unknown[][])[0]?.[0] as Record<
      string,
      unknown
    >;
  }

  it("stores anchorType/anchorId/anchorLabel on a suggestion", async () => {
    const tx = fakeTx({ recipe: commentRecipe });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await createComment(
      {
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        kind: "suggestion",
        body: "Use less salt here",
        anchorType: "ingredient",
        anchorId: "ing_7",
        anchorLabel: "2 tsp salt",
      },
      user,
    );

    expect(insertedComment(tx)).toMatchObject({
      kind: "suggestion",
      anchorType: "ingredient",
      anchorId: "ing_7",
      anchorLabel: "2 tsp salt",
    });
  });

  it("drops the anchor on a plain comment even if one is passed", async () => {
    const tx = fakeTx({ recipe: commentRecipe });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await createComment(
      {
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        kind: "comment",
        body: "Looks great",
        anchorType: "step",
        anchorId: "step_2",
        anchorLabel: "Step 2",
      },
      user,
    );

    expect(insertedComment(tx)).toMatchObject({
      kind: "comment",
      anchorType: null,
      anchorId: null,
      anchorLabel: null,
    });
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

/**
 * The recipe's full current state (ingredients/steps/tags + meta) as the #63
 * snapshot query loads it — structurally an AdaptationSource, so `recipeToInput`
 * can clone it into the version snapshot.
 */
const fullRecipeRow = {
  id: "recipe_1",
  title: "Sunday Sauce",
  description: null,
  coverImageUrl: null,
  servings: 6,
  servingsNoun: null,
  prepMinutes: null,
  cookMinutes: null,
  totalMinutes: null,
  restMinutes: null,
  makeAheadNote: null,
  equipment: null,
  difficulty: null,
  cuisine: null,
  sourceName: null,
  sourceUrl: null,
  notes: "Simmer low.",
  dietaryFlags: null,
  ingredients: [
    {
      section: null,
      quantity: 2,
      quantityMax: null,
      unit: "clove",
      item: "garlic",
      note: null,
      prep: null,
      stepPosition: null,
      optional: false,
    },
  ],
  steps: [
    {
      section: null,
      instruction: "Simmer low and slow.",
      imageUrl: null,
      videoUrl: null,
      timerSeconds: null,
      targetTempC: null,
      doneness: null,
      techniques: null,
    },
  ],
  tags: [{ tag: { name: "Italian" } }],
};

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
    const tx = fakeTx({ comment: suggestionRow, fullRecipe: fullRecipeRow });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await applySuggestion(applyArgs, ownerUser);

    const chain = (
      tx as {
        chain: {
          set: ReturnType<typeof vi.fn>;
          values: ReturnType<typeof vi.fn>;
        };
      }
    ).chain;

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

  it("snapshots the recipe into version history so the applied note is revertible (#63)", async () => {
    const tx = fakeTx({ comment: suggestionRow, fullRecipe: fullRecipeRow });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await applySuggestion(applyArgs, ownerUser);

    const chain = (tx as { chain: { values: ReturnType<typeof vi.fn> } }).chain;

    // A recipe_versions row is written, labeled and authored by the applying
    // owner, so the merged note becomes the latest saved version.
    const version = payloadWith(chain.values.mock.calls, "snapshot");
    expect(version).toMatchObject({
      recipeId: "recipe_1",
      authorId: "owner_9",
      label: "Suggestion applied",
    });

    // The snapshot carries the merged note — the whole point: reverting to the
    // latest version now restores (not drops) the applied suggestion.
    expect((version!.snapshot as { notes?: string }).notes).toBe(
      "Simmer low.\n\nAdd a bay leaf — suggested by Cousin Rae",
    );
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

describe("setRating blocks an author rating their own recipe", () => {
  it("rejects the recipe owner (SELF_RATING)", async () => {
    // recipeRow.authorId === ownerUser.id, so this is a self-rating.
    runWith(fakeTx({ recipe: recipeRow }));
    mockCanView.mockResolvedValue(true);

    await expect(
      setRating(
        { recipeId: "recipe_1", recipeSlug: "sunday-sauce", value: 5 },
        ownerUser,
      ),
    ).rejects.toThrow("SELF_RATING");
  });

  it("still lets a non-owner viewer rate the recipe", async () => {
    const tx = fakeTx({ recipe: recipeRow });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await expect(
      setRating(
        { recipeId: "recipe_1", recipeSlug: "sunday-sauce", value: 5 },
        user,
      ),
    ).resolves.toBeDefined();
    expect(
      (tx as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalled();
  });
});

describe("rating mutations keep the denormalized aggregates in step (issue #154)", () => {
  it("a brand-new vote bumps ratingCount by 1 and ratingSum by the value", async () => {
    const tx = fakeTx({ recipe: recipeRow, existingRating: null });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await setRating(
      { recipeId: "recipe_1", recipeSlug: "sunday-sauce", value: 5 },
      user,
    );

    const chain = (tx as { chain: { set: ReturnType<typeof vi.fn> } }).chain;
    const agg = payloadWith(chain.set.mock.calls, "ratingCount");
    expect(agg).toBeDefined();
    expect(paramsOf(agg!.ratingCount)).toContain(1);
    expect(paramsOf(agg!.ratingSum)).toContain(5);
  });

  it("changing an existing vote leaves the count and shifts the sum by the delta", async () => {
    const tx = fakeTx({ recipe: recipeRow, existingRating: { value: 2 } });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await setRating(
      { recipeId: "recipe_1", recipeSlug: "sunday-sauce", value: 5 },
      user,
    );

    const chain = (tx as { chain: { set: ReturnType<typeof vi.fn> } }).chain;
    const agg = payloadWith(chain.set.mock.calls, "ratingCount");
    expect(agg).toBeDefined();
    // No new voter: count delta is 0; sum moves by (5 - 2) = 3.
    expect(paramsOf(agg!.ratingCount)).toContain(0);
    expect(paramsOf(agg!.ratingSum)).toContain(3);
  });

  it("removeRating drops the count by 1 and the sum by the removed value", async () => {
    const tx = fakeTx({ recipe: recipeRow, existingRating: { value: 4 } });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await removeRating("recipe_1", user);

    const chain = (tx as { chain: { set: ReturnType<typeof vi.fn> } }).chain;
    const agg = payloadWith(chain.set.mock.calls, "ratingSum");
    expect(agg).toBeDefined();
    expect(paramsOf(agg!.ratingSum)).toContain(4);
  });

  it("removeRating on the owner's own (uncounted) rating leaves the aggregates alone", async () => {
    // ownerUser.id === recipeRow.authorId: a legacy self-rating the backfill
    // never counted, so deleting it must not decrement the owner-excluded totals.
    const tx = fakeTx({ recipe: recipeRow, existingRating: { value: 5 } });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await removeRating("recipe_1", ownerUser);

    const chain = (tx as { chain: { set: ReturnType<typeof vi.fn> } }).chain;
    expect(payloadWith(chain.set.mock.calls, "ratingSum")).toBeUndefined();
  });
});

/** An applied suggestion (folded into the recipe) owned by `owner_9`. */
const appliedSuggestionRow = {
  id: "sugg_1",
  kind: "suggestion",
  appliedAt: new Date(),
  recipe: { authorId: "owner_9", visibility: "group", groupId: "group_1" },
};

describe("resolveComment guards an applied suggestion", () => {
  it("refuses to reopen (resolved=false) a suggestion already applied", async () => {
    runWith(fakeTx({ comment: appliedSuggestionRow }));
    mockCanView.mockResolvedValue(true);

    await expect(resolveComment("sugg_1", ownerUser, false)).rejects.toThrow(
      "ALREADY_APPLIED",
    );
  });

  it("still allows closing (resolved=true) an applied suggestion", async () => {
    const tx = fakeTx({ comment: appliedSuggestionRow });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await resolveComment("sugg_1", ownerUser, true);
    expect(
      (tx as { update: ReturnType<typeof vi.fn> }).update,
    ).toHaveBeenCalled();
  });

  it("allows reopening a suggestion that was never applied", async () => {
    const tx = fakeTx({
      comment: { ...appliedSuggestionRow, appliedAt: null },
    });
    runWith(tx);
    mockCanView.mockResolvedValue(true);

    await resolveComment("sugg_1", ownerUser, false);
    expect(
      (tx as { update: ReturnType<typeof vi.fn> }).update,
    ).toHaveBeenCalled();
  });

  it("rejects a non-owner from resolving (FORBIDDEN)", async () => {
    runWith(
      fakeTx({
        comment: {
          ...appliedSuggestionRow,
          appliedAt: null,
          recipe: { ...appliedSuggestionRow.recipe, authorId: "someone_else" },
        },
      }),
    );
    mockCanView.mockResolvedValue(true);

    await expect(resolveComment("sugg_1", ownerUser, true)).rejects.toThrow(
      "FORBIDDEN",
    );
  });
});
