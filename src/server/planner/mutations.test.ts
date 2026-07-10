import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: { transaction: transactionMock },
}));

import { mealPlanEntries, type User } from "~/server/db/schema";
import { addEntry, removeEntry } from "./mutations";

const member = { id: "user_1" } as unknown as User;
const outsider = { id: "user_2" } as unknown as User;

type Entry = { id: string; userId: string; groupId: string | null } | null;

/**
 * Minimal transaction double mirroring the Drizzle query/builder surface the
 * planner mutations touch. `membership` is the row `isGroupMember` /
 * membership guards read; `entry` is the meal-plan row removeEntry loads.
 */
function fakeTx(opts: {
  membership?: { id: string } | null;
  entry?: Entry;
  created?: unknown;
  removed?: { id: string }[];
}) {
  const chain = {
    values: vi.fn((_arg?: unknown) => chain),
    where: vi.fn((_arg?: unknown) => chain),
    returning: vi.fn(async () =>
      opts.created != null ? [opts.created] : (opts.removed ?? [{ id: "e1" }]),
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
      },
    },
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => chain),
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
});
