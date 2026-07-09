import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    transaction: vi.fn(),
    query: {
      collections: { findFirst: vi.fn() },
      groupMembers: { findMany: vi.fn() },
    },
  },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import { getSharedCollection } from "./queries";
import {
  shareCollectionWithGroup,
  unshareCollectionWithGroup,
} from "./mutations";

type Viewer = Parameters<typeof getSharedCollection>[1];
const owner = { id: "owner1" } as unknown as NonNullable<Viewer>;
const member = { id: "member1" } as unknown as NonNullable<Viewer>;
const stranger = { id: "stranger1" } as unknown as NonNullable<Viewer>;

function recipe(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    authorId: "owner1",
    visibility: "public",
    groupId: null,
    author: { id: "owner1", name: "Owner" },
    tags: [],
    ratings: [],
    ...overrides,
  };
}

function collection(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    userId: "owner1",
    name: "Holiday Baking",
    description: null,
    coverImageUrl: null,
    visibility: "private",
    shareToken: "tok_abc",
    owner: { id: "owner1", name: "Owner" },
    sharedWithGroups: [{ group: { id: "g1", name: "Smiths", slug: "smiths" } }],
    createdAt: new Date(),
    updatedAt: new Date(),
    recipes: [{ recipe: recipe() }],
    ...overrides,
  };
}

describe("getSharedCollection group sharing (#365)", () => {
  beforeEach(() => {
    dbMock.query.collections.findFirst.mockReset();
    dbMock.query.groupMembers.findMany.mockReset();
  });

  it("lets a member of a group the collection is shared with view it", async () => {
    dbMock.query.collections.findFirst.mockResolvedValue(collection());
    // The viewer belongs to the shared group.
    dbMock.query.groupMembers.findMany.mockResolvedValue([{ groupId: "g1" }]);

    const result = await getSharedCollection("c1", member);
    expect(result).not.toBeNull();
    expect(result?.isOwner).toBe(false);
    expect(result?.sharedWithGroups.map((g) => g.id)).toEqual(["g1"]);
  });

  it("denies a non-member even when the collection is shared with some group", async () => {
    dbMock.query.collections.findFirst.mockResolvedValue(collection());
    // The viewer belongs to a *different* group, not the shared one.
    dbMock.query.groupMembers.findMany.mockResolvedValue([{ groupId: "other" }]);

    await expect(getSharedCollection("c1", stranger)).resolves.toBeNull();
  });

  it("revokes access as soon as the share link is gone", async () => {
    dbMock.query.collections.findFirst.mockResolvedValue(
      collection({ sharedWithGroups: [] }),
    );
    dbMock.query.groupMembers.findMany.mockResolvedValue([{ groupId: "g1" }]);

    await expect(getSharedCollection("c1", member)).resolves.toBeNull();
  });
});

describe("shareCollectionWithGroup / unshareCollectionWithGroup (#365)", () => {
  beforeEach(() => {
    dbMock.transaction.mockReset();
  });

  function withTx(tx: unknown) {
    dbMock.transaction.mockImplementation(
      async (cb: (t: unknown) => unknown) => cb(tx),
    );
  }

  it("shares when the owner is a member of the target group", async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });
    const tx = {
      query: {
        collections: {
          findFirst: vi.fn().mockResolvedValue({ id: "c1" }),
        },
        groupMembers: {
          findFirst: vi.fn().mockResolvedValue({ id: "m1" }),
        },
      },
      insert,
    };
    withTx(tx);

    await expect(
      shareCollectionWithGroup("c1", "g1", owner),
    ).resolves.toEqual({ collectionId: "c1", groupId: "g1" });
    expect(values).toHaveBeenCalledWith({
      collectionId: "c1",
      groupId: "g1",
      sharedById: "owner1",
    });
  });

  it("refuses to share a collection the caller doesn't own", async () => {
    const insert = vi.fn();
    const tx = {
      query: {
        collections: { findFirst: vi.fn().mockResolvedValue(undefined) },
        groupMembers: { findFirst: vi.fn() },
      },
      insert,
    };
    withTx(tx);

    await expect(
      shareCollectionWithGroup("c1", "g1", stranger),
    ).rejects.toThrow("NOT_FOUND");
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses to share with a group the owner doesn't belong to", async () => {
    const insert = vi.fn();
    const tx = {
      query: {
        collections: { findFirst: vi.fn().mockResolvedValue({ id: "c1" }) },
        groupMembers: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      insert,
    };
    withTx(tx);

    await expect(
      shareCollectionWithGroup("c1", "g1", owner),
    ).rejects.toThrow("NOT_FOUND");
    expect(insert).not.toHaveBeenCalled();
  });

  it("unshares only for the owner", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn().mockReturnValue({ where });
    const tx = {
      query: {
        collections: { findFirst: vi.fn().mockResolvedValue({ id: "c1" }) },
      },
      delete: del,
    };
    withTx(tx);

    await expect(
      unshareCollectionWithGroup("c1", "g1", owner),
    ).resolves.toEqual({ collectionId: "c1", groupId: "g1" });
    expect(del).toHaveBeenCalled();
  });

  it("refuses to unshare a collection the caller doesn't own", async () => {
    const del = vi.fn();
    const tx = {
      query: {
        collections: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      delete: del,
    };
    withTx(tx);

    await expect(
      unshareCollectionWithGroup("c1", "g1", stranger),
    ).rejects.toThrow("NOT_FOUND");
    expect(del).not.toHaveBeenCalled();
  });
});
