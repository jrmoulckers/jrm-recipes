import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbConfigured, findFirstMock, findManyMock, selectDistinctMock } =
  vi.hoisted(() => ({
    dbConfigured: { value: true },
    findFirstMock: vi.fn(),
    findManyMock: vi.fn(),
    selectDistinctMock: vi.fn(),
  }));

vi.mock("~/server/db", () => ({
  isDbConfigured: () => dbConfigured.value,
  db: {
    query: {
      users: { findFirst: findFirstMock },
      recipes: { findMany: findManyMock },
    },
    selectDistinct: selectDistinctMock,
  },
}));

import { getPublicProfileByHandle, listPublicCookHandles } from "./queries";

beforeEach(() => {
  dbConfigured.value = true;
  findFirstMock.mockReset();
  findManyMock.mockReset();
  selectDistinctMock.mockReset();
});

describe("getPublicProfileByHandle", () => {
  it("returns null for an empty handle without hitting the DB", async () => {
    expect(await getPublicProfileByHandle("   ")).toBeNull();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("returns null when the DB is unconfigured", async () => {
    dbConfigured.value = false;
    expect(await getPublicProfileByHandle("auntmay")).toBeNull();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("returns null for an unknown handle", async () => {
    findFirstMock.mockResolvedValue(undefined);
    expect(await getPublicProfileByHandle("nope")).toBeNull();
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("returns the user with their public recipes", async () => {
    const user = {
      id: "u1",
      name: "Aunt May",
      handle: "auntmay",
      avatarUrl: null,
      createdAt: new Date(),
    };
    const recipes = [{ id: "r1", slug: "cobbler", title: "Cobbler" }];
    findFirstMock.mockResolvedValue(user);
    findManyMock.mockResolvedValue(recipes);

    const profile = await getPublicProfileByHandle("auntmay");
    expect(profile).toEqual({ user, recipes });
  });
});

describe("listPublicCookHandles", () => {
  it("returns an empty list when the DB is unconfigured", async () => {
    dbConfigured.value = false;
    expect(await listPublicCookHandles()).toEqual([]);
    expect(selectDistinctMock).not.toHaveBeenCalled();
  });

  it("returns non-null handles only", async () => {
    selectDistinctMock.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: async () => [
            { handle: "auntmay" },
            { handle: null },
            { handle: "chefbo" },
          ],
        }),
      }),
    });
    expect(await listPublicCookHandles()).toEqual(["auntmay", "chefbo"]);
  });
});
