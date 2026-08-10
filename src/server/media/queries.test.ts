import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { queryBuilderDb } = await vi.hoisted(async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { default: postgres } = await import("postgres");
  const client = postgres("postgres://localhost:5432/test", { max: 1 });
  return { queryBuilderDb: drizzle(client, { casing: "snake_case" }) };
});

const { state, dbMock } = vi.hoisted(() => {
  const state = {
    configured: true,
    asset: undefined as { id: string; url: string; userId: string } | undefined,
    assetWhere: undefined as unknown,
    counts: new Map<unknown, number>(),
    countWheres: [] as { table: unknown; condition: unknown }[],
  };

  const dbMock = {
    query: {
      mediaAssets: {
        findFirst: vi.fn(async ({ where }: { where: unknown }) => {
          state.assetWhere = where;
          return state.asset;
        }),
      },
    },
    select: vi.fn(),
  };

  return { state, dbMock };
});

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => state.configured,
}));

import type { User } from "~/server/db/schema";
import { groupMembers, groups } from "~/server/db/schema";
import { getAssetUsage } from "./queries";

const dialect = new PgDialect({ casing: "snake_case" });
const user = { id: "u1" } as User;
const other = { id: "u2" } as User;
const assetUrl = "https://res.cloudinary.com/demo/image/upload/photo.jpg";

function countChain() {
  let table: unknown;
  const chain = {
    from: vi.fn((nextTable: unknown) => {
      table = nextTable;
      return chain;
    }),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(async (condition: unknown) => {
      state.countWheres.push({ table, condition });
      return [{ value: state.counts.get(table) ?? 0 }];
    }),
  };
  return chain;
}

beforeEach(() => {
  state.configured = true;
  state.asset = undefined;
  state.assetWhere = undefined;
  state.counts.clear();
  state.countWheres = [];
  vi.clearAllMocks();

  // The first select builds the membership subquery consumed by the group
  // predicate. Later selects are the six independent URL counts.
  dbMock.select
    .mockImplementationOnce(() =>
      queryBuilderDb.select({ id: groupMembers.groupId }),
    )
    .mockImplementation(() => countChain());
});

describe("getAssetUsage", () => {
  it("does not count a foreign group's use of the caller's photo", async () => {
    state.asset = { id: "m1", url: assetUrl, userId: user.id };
    // The database result is one visible group even if other groups use the URL.
    state.counts.set(groups, 1);

    const usage = await getAssetUsage("m1", user);

    expect(usage.bySurface.groups).toBe(1);
    expect(usage.total).toBe(1);

    const groupWhere = state.countWheres.find(({ table }) => table === groups)
      ?.condition as SQL | undefined;
    expect(groupWhere).toBeDefined();

    const query = dialect.sqlToQuery(groupWhere!);
    expect(query.sql).toContain('"groups"."id" in (select');
    expect(query.sql).toContain('"group_members"');
    expect(query.sql).toContain('"group_members"."user_id"');
    expect(query.params).toContain(user.id);
  });

  it("returns NOT_FOUND for a foreign-owned asset without an existence oracle", async () => {
    // The ownership predicate makes a real foreign row indistinguishable from a
    // missing row, so the mocked lookup returns no visible asset.
    await expect(getAssetUsage("foreign-asset", other)).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(dbMock.select).not.toHaveBeenCalled();

    const ownershipQuery = dialect.sqlToQuery(state.assetWhere as SQL);
    expect(ownershipQuery.sql).toContain('"media_assets"."user_id"');
    expect(ownershipQuery.params).toEqual(
      expect.arrayContaining(["foreign-asset", other.id]),
    );
  });
});
