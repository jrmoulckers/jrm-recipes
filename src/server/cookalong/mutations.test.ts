import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock, notifyManyMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  notifyManyMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: { transaction: transactionMock },
}));
vi.mock("~/server/notifications/notify", () => ({
  notifyMany: notifyManyMock,
}));

import { type User } from "~/server/db/schema";
import { createCookAlong, setRsvp, updateCookAlong } from "./mutations";

const host = { id: "user_host" } as unknown as User;
const outsider = { id: "user_out" } as unknown as User;

type TxOpts = {
  role?: string | null;
  recipe?: { id: string; groupId: string | null; title: string } | null;
  event?: { id: string; groupId: string; hostId: string | null } | null;
  members?: { userId: string }[];
};

function fakeTx(opts: TxOpts) {
  const inserted: { table: string; values: Record<string, unknown> }[] = [];
  const updates: Record<string, unknown>[] = [];

  const insertChain = (table: string) => {
    const chain = {
      values: vi.fn((v: Record<string, unknown>) => {
        inserted.push({ table, values: v });
        return chain;
      }),
      onConflictDoNothing: vi.fn(() => chain),
      onConflictDoUpdate: vi.fn(() => chain),
      returning: vi.fn(async () => [{ id: "cookalong_1", ...inserted.at(-1)?.values }]),
    };
    return chain;
  };

  const updateChain = {
    set: vi.fn((v: Record<string, unknown>) => {
      updates.push(v);
      return updateChain;
    }),
    where: vi.fn(async () => undefined),
  };

  const tx = {
    inserted,
    updates,
    query: {
      groupMembers: {
        findFirst: vi.fn(async () =>
          opts.role === null ? undefined : { role: opts.role ?? "member" },
        ),
        findMany: vi.fn(async () => opts.members ?? []),
      },
      recipes: {
        findFirst: vi.fn(async () =>
          opts.recipe === undefined
            ? { id: "recipe_1", groupId: "group_1", title: "Gnocchi" }
            : opts.recipe,
        ),
      },
      cookAlongs: {
        findFirst: vi.fn(async () =>
          opts.event === undefined
            ? { id: "cookalong_1", groupId: "group_1", hostId: "user_host" }
            : opts.event,
        ),
      },
    },
    insert: vi.fn((table: { _: { name?: string } }) =>
      insertChain(String((table as { _?: { name?: string } })?._?.name ?? "t")),
    ),
    update: vi.fn(() => updateChain),
  };
  return tx;
}

function runWith(tx: unknown) {
  transactionMock.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCookAlong (#353)", () => {
  it("rejects a non-member host", async () => {
    const tx = fakeTx({ role: null });
    runWith(tx);
    await expect(
      createCookAlong(
        {
          groupId: "group_1",
          recipeId: "recipe_1",
          scheduledFor: new Date(Date.now() + 100000),
        },
        outsider,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("rejects a recipe outside the group", async () => {
    const tx = fakeTx({
      role: "member",
      recipe: { id: "recipe_1", groupId: "other_group", title: "X" },
    });
    runWith(tx);
    await expect(
      createCookAlong(
        {
          groupId: "group_1",
          recipeId: "recipe_1",
          scheduledFor: new Date(Date.now() + 100000),
        },
        host,
      ),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("creates the event, auto-RSVPs the host, and invites the group", async () => {
    const tx = fakeTx({
      role: "member",
      recipe: { id: "recipe_1", groupId: "group_1", title: "Gnocchi" },
      members: [{ userId: "user_host" }, { userId: "user_2" }],
    });
    runWith(tx);
    await createCookAlong(
      {
        groupId: "group_1",
        recipeId: "recipe_1",
        title: "Sunday night",
        scheduledFor: new Date(Date.now() + 100000),
      },
      host,
    );
    // One insert for the event, one for the host RSVP.
    const rsvpInsert = tx.inserted.find(
      (i) => i.values.status === "going" && i.values.userId === "user_host",
    );
    expect(rsvpInsert).toBeTruthy();
    expect(notifyManyMock).toHaveBeenCalledOnce();
    const [, recipients, params] = notifyManyMock.mock.calls[0]!;
    expect(recipients).toEqual(["user_host", "user_2"]);
    expect(params.type).toBe("cook_along_invite");
  });
});

describe("setRsvp (#353)", () => {
  it("rejects a non-member", async () => {
    const tx = fakeTx({ role: null });
    runWith(tx);
    await expect(
      setRsvp({ cookAlongId: "cookalong_1", status: "going" }, outsider),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("upserts the RSVP for a member", async () => {
    const tx = fakeTx({ role: "member" });
    runWith(tx);
    await setRsvp({ cookAlongId: "cookalong_1", status: "maybe" }, host);
    const rsvp = tx.inserted.find((i) => i.values.status === "maybe");
    expect(rsvp?.values.cookAlongId).toBe("cookalong_1");
  });
});

describe("updateCookAlong (#353)", () => {
  it("lets the host edit", async () => {
    const tx = fakeTx({
      role: "member",
      event: { id: "cookalong_1", groupId: "group_1", hostId: "user_host" },
    });
    runWith(tx);
    await updateCookAlong(
      {
        cookAlongId: "cookalong_1",
        scheduledFor: new Date(Date.now() + 100000),
      },
      host,
    );
    expect(tx.updates.length).toBe(1);
  });

  it("blocks a non-host, non-manager member", async () => {
    const tx = fakeTx({
      role: "member",
      event: { id: "cookalong_1", groupId: "group_1", hostId: "someone_else" },
    });
    runWith(tx);
    await expect(
      updateCookAlong(
        {
          cookAlongId: "cookalong_1",
          scheduledFor: new Date(Date.now() + 100000),
        },
        host,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("lets a group admin edit someone else's cook-along", async () => {
    const tx = fakeTx({
      role: "admin",
      event: { id: "cookalong_1", groupId: "group_1", hostId: "someone_else" },
    });
    runWith(tx);
    await updateCookAlong(
      {
        cookAlongId: "cookalong_1",
        scheduledFor: new Date(Date.now() + 100000),
      },
      host,
    );
    expect(tx.updates.length).toBe(1);
  });
});
