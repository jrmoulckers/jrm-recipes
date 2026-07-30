import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, transactionMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: { reactions: { findMany: findManyMock } },
    transaction: transactionMock,
  },
  isDbConfigured: () => true,
}));
vi.mock("~/server/recipes/queries", () => ({ canViewRecipe: vi.fn() }));

import { canViewRecipe } from "~/server/recipes/queries";
import type { User } from "~/server/db/schema";
import {
  getReactionsForTargets,
  toggleReaction,
  type ReactionTargetType,
} from "./reactions";

type Row = {
  targetId: string;
  emoji: string;
  userId: string;
  user: { id: string; name: string | null; handle: string | null };
};

const rows: Row[] = [
  {
    targetId: "c1",
    emoji: "love",
    userId: "blocked_1",
    user: { id: "blocked_1", name: "Blocked Bob", handle: "bob" },
  },
  {
    targetId: "c1",
    emoji: "love",
    userId: "friend_1",
    user: { id: "friend_1", name: "Amy", handle: "amy" },
  },
];

describe("getReactionsForTargets block filtering (#355)", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    findManyMock.mockResolvedValue(rows);
  });

  it("counts and names every reactor when nothing is blocked", async () => {
    const map = await getReactionsForTargets("comment", ["c1"], "viewer_1");
    const target = map.get("c1")!;
    expect(target.counts).toEqual([
      { emoji: "love", count: 2, reacted: false },
    ]);
    expect(target.reactors.love).toEqual(["Blocked Bob", "Amy"]);
  });

  it("drops a blocked reactor from both the count and the reactor names", async () => {
    const map = await getReactionsForTargets(
      "comment",
      ["c1"],
      "viewer_1",
      new Set(["blocked_1"]),
    );
    const target = map.get("c1")!;
    expect(target.counts).toEqual([
      { emoji: "love", count: 1, reacted: false },
    ]);
    expect(target.reactors.love).toEqual(["Amy"]);
    expect(target.reactors.love).not.toContain("Blocked Bob");
  });
});

const reactor = { id: "user_1" } as unknown as User;

const recipeRow = {
  id: "recipe_1",
  title: "Sunday Sauce",
  authorId: "owner_9",
  visibility: "group" as const,
  groupId: "group_1",
};

/**
 * Build a fake transaction for {@link toggleReaction}: the target lookup returns
 * `target`, the existing-reaction probe returns `existing`, and the insert's
 * `returning()` yields `inserted` (empty models a conflict that inserted nothing).
 */
function fakeTx(opts: {
  target?: unknown;
  existing?: { id: string } | null;
  inserted?: { id: string }[];
}) {
  const chain = {
    values: vi.fn(() => chain),
    onConflictDoNothing: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(async () => opts.inserted ?? [{ id: "reaction_1" }]),
  };
  const findFirst = vi.fn(async () => opts.target ?? null);
  const tx = {
    chain,
    query: {
      comments: { findFirst },
      reviews: { findFirst },
      cookLogEntries: { findFirst },
      reactions: { findFirst: vi.fn(async () => opts.existing ?? null) },
    },
    insert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
  };
  return tx;
}

/** Notification payloads captured from the tx's insert().values() calls. */
function notifications(tx: ReturnType<typeof fakeTx>) {
  return (tx.chain.values.mock.calls as unknown[][])
    .map((call) => call[0] as Record<string, unknown> | undefined)
    .filter(
      (v): v is Record<string, unknown> =>
        !!v && typeof v.type === "string" && "recipientId" in v,
    );
}

function runWith(tx: unknown) {
  transactionMock.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
}

describe("toggleReaction notifies the content owner (#348)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canViewRecipe).mockResolvedValue(true);
  });

  it("adds a reaction notification to the content owner", async () => {
    const tx = fakeTx({
      target: { id: "c1", userId: "owner_c", recipe: recipeRow },
    });
    runWith(tx);

    const result = await toggleReaction(
      { targetType: "comment", targetId: "c1", emoji: "love" },
      reactor,
    );

    expect(result).toEqual({ reacted: true });
    const notes = notifications(tx);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      recipientId: "owner_c",
      actorId: "user_1",
      type: "reaction",
      recipeId: "recipe_1",
      entityId: "c1",
      context: "comment",
    });
  });

  it("does not notify on a self-reaction", async () => {
    const tx = fakeTx({
      target: { id: "c1", userId: "user_1", recipe: recipeRow },
    });
    runWith(tx);

    const result = await toggleReaction(
      { targetType: "comment", targetId: "c1", emoji: "love" },
      reactor,
    );

    expect(result).toEqual({ reacted: true });
    expect(notifications(tx)).toHaveLength(0);
  });

  it("does not notify when removing a reaction (toggle-off)", async () => {
    const tx = fakeTx({
      target: { id: "c1", userId: "owner_c", recipe: recipeRow },
      existing: { id: "reaction_1" },
    });
    runWith(tx);

    const result = await toggleReaction(
      { targetType: "comment", targetId: "c1", emoji: "love" },
      reactor,
    );

    expect(result).toEqual({ reacted: false });
    expect(tx.delete).toHaveBeenCalled();
    expect(notifications(tx)).toHaveLength(0);
  });

  it("does not notify when the insert loses a conflict race", async () => {
    const tx = fakeTx({
      target: { id: "c1", userId: "owner_c", recipe: recipeRow },
      inserted: [],
    });
    runWith(tx);

    const result = await toggleReaction(
      { targetType: "comment", targetId: "c1", emoji: "love" },
      reactor,
    );

    expect(result).toEqual({ reacted: true });
    expect(notifications(tx)).toHaveLength(0);
  });

  it.each([
    ["comment", "owner_c", "comment"],
    ["review", "owner_r", "review"],
    ["cook_log", "owner_k", "cook"],
  ] as [ReactionTargetType, string, string][])(
    "resolves the owner + recipe deep-link for a %s reaction",
    async (targetType, ownerId, label) => {
      const tx = fakeTx({
        target: { id: "t1", userId: ownerId, recipe: recipeRow },
      });
      runWith(tx);

      await toggleReaction(
        { targetType, targetId: "t1", emoji: "yum" },
        reactor,
      );

      const notes = notifications(tx);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({
        recipientId: ownerId,
        type: "reaction",
        recipeId: "recipe_1",
        entityId: "t1",
        context: label,
      });
    },
  );
});
