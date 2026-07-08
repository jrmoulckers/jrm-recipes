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
import { setCollectionVisibility } from "./mutations";

type Viewer = Parameters<typeof getSharedCollection>[1];
const owner = { id: "owner1" } as unknown as NonNullable<Viewer>;
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
    createdAt: new Date(),
    updatedAt: new Date(),
    recipes: [{ recipe: recipe() }],
    ...overrides,
  };
}

describe("getSharedCollection access rules (#281)", () => {
  beforeEach(() => {
    dbMock.query.collections.findFirst.mockReset();
    dbMock.query.groupMembers.findMany.mockReset();
    dbMock.query.groupMembers.findMany.mockResolvedValue([]);
  });

  it("returns null for a private collection viewed by a stranger", async () => {
    dbMock.query.collections.findFirst.mockResolvedValue(collection());
    await expect(getSharedCollection("c1", stranger)).resolves.toBeNull();
  });

  it("lets the owner view their own private collection", async () => {
    dbMock.query.collections.findFirst.mockResolvedValue(collection());
    const result = await getSharedCollection("c1", owner);
    expect(result?.isOwner).toBe(true);
    expect(result?.name).toBe("Holiday Baking");
  });

  it("permits an unlisted collection only when reached by its share token", async () => {
    dbMock.query.collections.findFirst.mockResolvedValue(
      collection({ visibility: "unlisted" }),
    );
    // Reached via token → allowed.
    await expect(
      getSharedCollection("tok_abc", stranger),
    ).resolves.not.toBeNull();

    dbMock.query.collections.findFirst.mockResolvedValue(
      collection({ visibility: "unlisted" }),
    );
    // Reached via the collection id (guessing) → still forbidden.
    await expect(getSharedCollection("c1", stranger)).resolves.toBeNull();
  });

  it("permits a public collection for anyone", async () => {
    dbMock.query.collections.findFirst.mockResolvedValue(
      collection({ visibility: "public" }),
    );
    const result = await getSharedCollection("c1", stranger);
    expect(result?.isOwner).toBe(false);
    expect(result?.ownerName).toBe("Owner");
  });

  it("returns null when the collection does not exist", async () => {
    dbMock.query.collections.findFirst.mockResolvedValue(undefined);
    await expect(getSharedCollection("missing", owner)).resolves.toBeNull();
  });

  it("strips recipes the viewer isn't allowed to see", async () => {
    dbMock.query.collections.findFirst.mockResolvedValue(
      collection({
        visibility: "public",
        recipes: [
          { recipe: recipe({ id: "pub", visibility: "public" }) },
          {
            recipe: recipe({
              id: "secret",
              visibility: "private",
              authorId: "owner1",
            }),
          },
        ],
      }),
    );
    const result = await getSharedCollection("c1", stranger);
    expect(result?.recipes.map((r) => r.id)).toEqual(["pub"]);
  });
});

describe("setCollectionVisibility (#281)", () => {
  beforeEach(() => {
    dbMock.transaction.mockReset();
  });

  function withTx(tx: unknown) {
    dbMock.transaction.mockImplementation(
      async (cb: (t: unknown) => unknown) => cb(tx),
    );
  }

  it("mints a share token the first time a collection leaves private", async () => {
    let capturedRow: Record<string, unknown> = {};
    const returning = vi
      .fn()
      .mockImplementation(() => Promise.resolve([capturedRow]));
    const set = vi.fn().mockImplementation((values: Record<string, unknown>) => {
      capturedRow = {
        id: "c1",
        visibility: values.visibility,
        shareToken: values.shareToken,
      };
      return { where: () => ({ returning }) };
    });
    const tx = {
      query: {
        collections: {
          findFirst: vi.fn().mockResolvedValue({ id: "c1", shareToken: null }),
        },
      },
      update: vi.fn().mockReturnValue({ set }),
    };
    withTx(tx);

    const row = await setCollectionVisibility("c1", "unlisted", owner);
    const setArg = set.mock.calls[0]![0] as { shareToken: string | null };
    expect(typeof setArg.shareToken).toBe("string");
    expect(setArg.shareToken).toBeTruthy();
    expect(row.visibility).toBe("unlisted");
  });

  it("throws NOT_FOUND when the caller doesn't own the collection", async () => {
    const tx = {
      query: {
        collections: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      update: vi.fn(),
    };
    withTx(tx);

    await expect(
      setCollectionVisibility("c1", "public", stranger),
    ).rejects.toThrow("NOT_FOUND");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("reuses an existing share token instead of minting a new one", async () => {
    const set = vi.fn().mockReturnValue({
      where: () => ({
        returning: () =>
          Promise.resolve([
            { id: "c1", visibility: "public", shareToken: "existing" },
          ]),
      }),
    });
    const tx = {
      query: {
        collections: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: "c1", shareToken: "existing" }),
        },
      },
      update: vi.fn().mockReturnValue({ set }),
    };
    withTx(tx);

    await setCollectionVisibility("c1", "public", owner);
    const setArg = set.mock.calls[0]![0] as { shareToken: string | null };
    expect(setArg.shareToken).toBe("existing");
  });
});
