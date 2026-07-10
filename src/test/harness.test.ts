import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeUser } from "~/test/factories";
import {
  authModuleMock,
  chainable,
  createDbMock,
  dbModuleMock,
  mockAuth,
  useAuthMock,
  useDbMock,
  type DbMock,
} from "./harness";

describe("createDbMock (#225)", () => {
  let db: DbMock;
  beforeEach(() => {
    db = createDbMock();
  });

  it("exposes findFirst/findMany for the common tables", () => {
    expect(db.query.recipes.findFirst).toBeTypeOf("function");
    expect(db.query.groupMembers.findMany).toBeTypeOf("function");
  });

  it("runs the transaction callback against a tx sharing the statement fns", async () => {
    db.tx.query.recipes.findFirst.mockResolvedValue({ id: "r1" });

    const seen = await db.transaction(async (tx) => {
      await tx.insert("recipes").values({ id: "r1" });
      return tx.query.recipes.findFirst();
    });

    expect(seen).toEqual({ id: "r1" });
    // A write inside the transaction is observable on the shared `insert` fn.
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("runs nested SAVEPOINT (tx.transaction) callbacks too", async () => {
    let ran = false;
    await db.transaction(async (tx) => {
      await tx.transaction(async () => {
        ran = true;
      });
    });
    expect(ran).toBe(true);
  });

  it("lets a test configure a .returning() result via chainable", async () => {
    db.insert.mockReturnValue({
      values: vi.fn(() => chainable([{ id: "r9" }])),
    });

    const [row] = await db.insert("recipes").values({}).returning();

    expect(row).toEqual({ id: "r9" });
  });

  it("accepts extra tables", () => {
    const extended = createDbMock(["reviews"]);
    expect(extended.query.reviews?.findFirst).toBeTypeOf("function");
  });
});

describe("mockAuth / auth module shim (#225)", () => {
  it("mockAuth resolves requireUser/getCurrentUser to the given user", async () => {
    const user = makeUser({ id: "u_42" });
    const auth = mockAuth({ user });
    await expect(auth.requireUser()).resolves.toEqual(user);
    await expect(auth.getCurrentUser()).resolves.toEqual(user);
  });

  it("mockAuth() with no user models a signed-out visitor", async () => {
    const auth = mockAuth();
    await expect(auth.requireUser()).rejects.toThrow("UNAUTHENTICATED");
    await expect(auth.getCurrentUser()).resolves.toBeNull();
  });

  it("authModuleMock reflects whatever useAuthMock installed", async () => {
    const auth = authModuleMock();
    useAuthMock(makeUser({ id: "u_7" }));
    await expect(auth.getCurrentUser()).resolves.toMatchObject({ id: "u_7" });
    useAuthMock(null);
    await expect(auth.getCurrentUser()).resolves.toBeNull();
  });
});

describe("db module shim proxy (#225)", () => {
  it("forwards to the installed mock and reports isDbConfigured", () => {
    const shim = dbModuleMock();
    const installed = useDbMock();
    expect(shim.isDbConfigured()).toBe(true);
    // The proxy `db` resolves to the active mock's statement fns.
    expect(shim.db.insert).toBe(installed.insert);
  });
});
