import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: { transaction: transactionMock },
}));

import { mealPlanEntries, type User } from "~/server/db/schema";
import {
  addEntry,
  addMealWithLeftovers,
  copyPreviousWeek,
  removeEntry,
} from "./mutations";

vi.mock("~/server/dietary/gating", () => ({
  planWarningsForRecipe: vi.fn(async () => []),
}));

const member = { id: "user_1" } as unknown as User;
const outsider = { id: "user_2" } as unknown as User;

type Entry = {
  id: string;
  userId: string;
  groupId: string | null;
  plannedServings?: number | null;
  leftoverSourceId?: string | null;
} | null;
type Created = { id: string; groupId?: string | null };
type CopyEntry = {
  id: string;
  date: string;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  recipeId: string | null;
  groupId: string | null;
  plannedServings: number | null;
  servingsMade: number | null;
  leftoverSourceId: string | null;
  note: string | null;
  position: number;
};

/**
 * Minimal transaction double mirroring the Drizzle query/builder surface the
 * planner mutations touch. `membership` is the row `isGroupMember` /
 * membership guards read. `entry` is the meal-plan row removeEntry loads.
 */
function fakeTx(opts: {
  membership?: { id: string } | null;
  entry?: Entry;
  recipe?: {
    id: string;
    authorId: string;
    visibility: string;
    groupId: string | null;
  } | null;
  created?: Created | Created[];
  removed?: { id: string }[];
  previousEntries?: CopyEntry[];
  currentEntries?: Array<Pick<CopyEntry, "date" | "slot">>;
}) {
  const created: Created[] = Array.isArray(opts.created)
    ? [...opts.created]
    : opts.created != null
      ? [opts.created]
      : [];
  const chain = {
    values: vi.fn((_arg?: unknown) => chain),
    set: vi.fn((_arg?: unknown) => chain),
    where: vi.fn((_arg?: unknown) => chain),
    returning: vi.fn(async () =>
      created.length > 0
        ? [created.shift()!]
        : (opts.removed ?? [{ id: "e1" }]),
    ),
  };
  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(async () => [{ next: 0 }]),
  };
  return {
    chain,
    query: {
      groupMembers: {
        findFirst: vi.fn(async () => opts.membership ?? null),
      },
      mealPlanEntries: {
        findFirst: vi.fn(async () => opts.entry ?? null),
        findMany: vi
          .fn()
          .mockResolvedValueOnce(opts.previousEntries ?? [])
          .mockResolvedValueOnce(opts.currentEntries ?? []),
      },
      recipes: {
        findFirst: vi.fn(async () => opts.recipe ?? null),
      },
    },
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
  };
}

function runWith(tx: unknown) {
  transactionMock.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
}

beforeEach(() => vi.clearAllMocks());

describe("addEntry group scope (issue #363)", () => {
  it("tags a new entry with the group when the caller is a member", async () => {
    const tx = fakeTx({
      membership: { id: "m1" },
      created: { id: "e1", groupId: "group_1" },
    });

    runWith(tx);

    await addEntry(
      {
        date: "2024-01-01",
        slot: "dinner",
        note: "Taco night",
        groupId: "group_1",
      },
      member,
    );

    expect(tx.insert).toHaveBeenCalledWith(mealPlanEntries);
    const values = tx.chain.values.mock.calls[0]![0] as {
      groupId: string | null;
    };
    expect(values.groupId).toBe("group_1");
  });

  it("rejects a non-member trying to write to a group plan", async () => {
    const tx = fakeTx({ membership: null });
    runWith(tx);

    await expect(
      addEntry(
        {
          date: "2024-01-01",
          slot: "dinner",
          note: "Nope",
          groupId: "group_1",
        },
        outsider,
      ),
    ).rejects.toThrow("FORBIDDEN");
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

describe("addMealWithLeftovers serving allocations (#611)", () => {
  it("stores total servings on the source and exact servings on each meal", async () => {
    const tx = fakeTx({
      recipe: {
        id: "recipe_1",
        authorId: member.id,
        visibility: "private",
        groupId: null,
      },
      created: [{ id: "source" }, { id: "left_1" }, { id: "left_2" }],
    });
    runWith(tx);

    const result = await addMealWithLeftovers(
      {
        date: "2026-07-06",
        slot: "dinner",
        recipeId: "recipe_1",
        mealServings: 3,
        leftovers: [
          { date: "2026-07-07", slot: "lunch", servings: 1 },
          { date: "2026-07-09", slot: "dinner", servings: 2 },
        ],
      },
      member,
    );

    expect(result).toMatchObject({
      primaryId: "source",
      leftoverIds: ["left_1", "left_2"],
    });
    const values = tx.chain.values.mock.calls.map((call) => call[0]);
    expect(values[0]).toMatchObject({
      plannedServings: 3,
      servingsMade: 6,
    });
    expect(values[1]).toMatchObject({
      slot: "lunch",
      plannedServings: 1,
      leftoverSourceId: "source",
    });
    expect(values[2]).toMatchObject({
      slot: "dinner",
      plannedServings: 2,
      leftoverSourceId: "source",
    });
  });
});

describe("copyPreviousWeek serving allocations (#611)", () => {
  it("copies a shared week when the caller belongs to the family", async () => {
    const tx = fakeTx({
      membership: { id: "m1" },
      previousEntries: [
        {
          id: "family-meal",
          date: "2026-07-06",
          slot: "dinner",
          recipeId: "recipe_1",
          groupId: "group_1",
          plannedServings: 4,
          servingsMade: 4,
          leftoverSourceId: null,
          note: null,
          position: 0,
        },
      ],
      currentEntries: [],
      created: { id: "copied-meal" },
    });
    runWith(tx);

    await expect(
      copyPreviousWeek(member, "2026-07-13", "group_1"),
    ).resolves.toEqual({
      copied: 1,
      previousEmpty: false,
    });
    expect(tx.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: member.id,
        groupId: "group_1",
        date: "2026-07-13",
      }),
    );
  });

  it("rejects a non-member copying a shared week", async () => {
    const tx = fakeTx({ membership: null });
    runWith(tx);

    await expect(
      copyPreviousWeek(outsider, "2026-07-13", "group_1"),
    ).rejects.toThrow("FORBIDDEN");
    expect(tx.query.mealPlanEntries.findMany).not.toHaveBeenCalled();
  });

  it("keeps an eligible leftover as a standalone meal when its source cell is occupied", async () => {
    const tx = fakeTx({
      previousEntries: [
        {
          id: "source",
          date: "2026-07-06",
          slot: "dinner",
          recipeId: "recipe_1",
          groupId: null,
          plannedServings: 3,
          servingsMade: 4,
          leftoverSourceId: null,
          note: null,
          position: 0,
        },
        {
          id: "left_1",
          date: "2026-07-07",
          slot: "lunch",
          recipeId: "recipe_1",
          groupId: null,
          plannedServings: 1,
          servingsMade: null,
          leftoverSourceId: "source",
          note: null,
          position: 0,
        },
      ],
      currentEntries: [{ date: "2026-07-13", slot: "dinner" }],
    });
    runWith(tx);

    await expect(copyPreviousWeek(member, "2026-07-13")).resolves.toEqual({
      copied: 1,
      previousEmpty: false,
    });
    expect(tx.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2026-07-14",
        slot: "lunch",
        plannedServings: 1,
        servingsMade: 1,
        leftoverSourceId: null,
      }),
    );
  });
});

describe("removeEntry group scope (issue #363)", () => {
  it("lets any group member remove a group entry they didn't author", async () => {
    const tx = fakeTx({
      entry: { id: "e1", userId: "user_1", groupId: "group_1" },
      membership: { id: "m2" },
      removed: [{ id: "e1" }],
    });
    runWith(tx);

    const result = await removeEntry("e1", outsider);
    expect(result).toEqual({ id: "e1" });
    expect(tx.delete).toHaveBeenCalledWith(mealPlanEntries);
  });

  it("rejects a non-member removing a group entry", async () => {
    const tx = fakeTx({
      entry: { id: "e1", userId: "user_1", groupId: "group_1" },
      membership: null,
    });
    runWith(tx);

    await expect(removeEntry("e1", outsider)).rejects.toThrow("FORBIDDEN");
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("keeps a personal entry owner-only", async () => {
    const tx = fakeTx({
      entry: { id: "e1", userId: "user_1", groupId: null },
    });
    runWith(tx);

    await expect(removeEntry("e1", outsider)).rejects.toThrow("NOT_FOUND");
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("reduces the source total when one leftover allocation is removed", async () => {
    const tx = fakeTx({
      entry: {
        id: "left_1",
        userId: member.id,
        groupId: null,
        plannedServings: 1,
        leftoverSourceId: "source",
      },
    });
    runWith(tx);

    await removeEntry("left_1", member);

    expect(tx.update).toHaveBeenCalledWith(mealPlanEntries);
  });

  it("removes linked allocations when requested with the source", async () => {
    const tx = fakeTx({
      entry: {
        id: "source",
        userId: member.id,
        groupId: null,
        plannedServings: 3,
        leftoverSourceId: null,
      },
    });
    runWith(tx);

    await removeEntry("source", member, true);

    expect(tx.delete).toHaveBeenCalledTimes(2);
  });

  it("turns kept allocations into standalone meals with servings made", async () => {
    const tx = fakeTx({
      entry: {
        id: "source",
        userId: member.id,
        groupId: null,
        plannedServings: 3,
        leftoverSourceId: null,
      },
    });
    runWith(tx);

    await removeEntry("source", member);

    expect(tx.chain.set).toHaveBeenCalledWith({
      leftoverSourceId: null,
      servingsMade: mealPlanEntries.plannedServings,
    });
  });
});
