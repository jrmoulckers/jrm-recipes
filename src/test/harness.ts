/**
 * Shared Drizzle + auth mocking harness for server-module unit tests (issue #225).
 *
 * Server-module tests each used to re-declare the same `vi.hoisted` + `vi.mock`
 * boilerplate: a fake `db` with `query.<table>.findFirst/findMany`, a
 * `transaction(fn)` stub, chainable `insert().values().returning()` /
 * `update().set().where()` builders, plus `vi.mock("server-only")` and auth
 * stubs. Getting the fluent shape subtly wrong made the untested write modules
 * painful to cover. This centralizes that pattern.
 *
 * ## How to use it
 *
 * The `db`/`auth` modules are captured by the code under test at import time,
 * *before* a test body runs — the classic hoisting trap. This harness sidesteps
 * it with a stable Proxy: `dbModuleMock()` / `authModuleMock()` return module
 * shims backed by an "active" mock you install per-test with {@link useDbMock} /
 * {@link useAuthMock} (typically in `beforeEach`). Because the code under test
 * only ever holds the proxy, whatever you install later is what it sees.
 *
 * ```ts
 * import { beforeEach, describe, expect, it, vi } from "vitest";
 * import {
 *   authModuleMock, dbModuleMock, useAuthMock, useDbMock, type DbMock,
 * } from "~/test/harness";
 * import { makeUser } from "~/test/factories";
 *
 * vi.mock("server-only", () => ({}));
 * vi.mock("~/server/db", async () => (await import("~/test/harness")).dbModuleMock());
 * vi.mock("~/server/auth", async () => (await import("~/test/harness")).authModuleMock());
 *
 * import { someServerFn } from "./mutations";
 *
 * let db: DbMock;
 * beforeEach(() => {
 *   db = useDbMock();
 *   useAuthMock(makeUser());
 * });
 *
 * it("writes a row", async () => {
 *   db.tx.query.recipes.findFirst.mockResolvedValue(undefined);
 *   await someServerFn(...);
 *   expect(db.insert).toHaveBeenCalled();
 * });
 * ```
 */
import { vi, type Mock } from "vitest";

import type { User } from "~/server/db/schema";

/** The fluent builder surface an insert/statement resolves through. */
export interface Chainable {
  returning: Mock<(...cols: unknown[]) => Promise<unknown[]>>;
  onConflictDoNothing: Mock<(...args: unknown[]) => Promise<undefined>>;
  then: (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

/**
 * A resolved-then-chainable drizzle builder stand-in. `await db.insert(t)
 * .values(v)` resolves to `rows`, while `.returning(...)` and
 * `.onConflictDoNothing(...)` are also awaitable — matching the fluent surface
 * the mutation code walks.
 */
export function chainable(rows: unknown[] = []): Chainable {
  return {
    returning: vi.fn(
      (..._cols: unknown[]): Promise<unknown[]> => Promise.resolve(rows),
    ),
    onConflictDoNothing: vi.fn(
      (..._args: unknown[]): Promise<undefined> => Promise.resolve(undefined),
    ),
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(onFulfilled, onRejected),
  };
}

/** A vitest fake `query.<table>` surface. */
export type QueryTableMock = {
  findFirst: Mock<(...args: unknown[]) => Promise<unknown>>;
  findMany: Mock<(...args: unknown[]) => Promise<unknown[]>>;
};

type InsertBuilder = { values: (vals?: unknown) => Chainable };
type UpdateBuilder = {
  set: (vals?: unknown) => { where: (where?: unknown) => Promise<undefined> };
};
type DeleteBuilder = { where: (where?: unknown) => Promise<undefined> };
type SelectBuilder = {
  from: (table?: unknown) => { where: (where?: unknown) => Promise<unknown[]> };
};

/** The drizzle statement builders shared by `db` and each `tx`. */
export interface StatementMocks {
  insert: Mock<(table?: unknown) => InsertBuilder>;
  update: Mock<(table?: unknown) => UpdateBuilder>;
  delete: Mock<(table?: unknown) => DeleteBuilder>;
  select: Mock<(...columns: unknown[]) => SelectBuilder>;
}

/** The transaction/statement surface shared by `db` and its `tx` callback arg. */
export interface TxMock extends StatementMocks {
  query: Record<string, QueryTableMock>;
  /** Nested SAVEPOINT (`tx.transaction`) that runs its callback against `tx`. */
  transaction: Mock<(cb: (tx: TxMock) => unknown) => unknown>;
}

/** Default tables exposed on `query`; extend per-test via {@link createDbMock}. */
const DEFAULT_TABLES = [
  "recipes",
  "recipeIngredients",
  "recipeSteps",
  "recipeVersions",
  "recipeEvents",
  "recipeTags",
  "tags",
  "groups",
  "groupMembers",
  "users",
] as const;

function makeQuery(tables: readonly string[]): Record<string, QueryTableMock> {
  const query: Record<string, QueryTableMock> = {};
  for (const t of tables)
    query[t] = {
      findFirst: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
    };
  return query;
}

/** The full fake db plus handles for configuring/asserting on it. */
export interface DbMock extends StatementMocks {
  /** Object to hand to `vi.mock("~/server/db", () => ({ db }))`. */
  db: TxMock & { $count: Mock };
  /** The tx object every `transaction(cb)` / SAVEPOINT callback receives. */
  tx: TxMock;
  /** Shorthand for `db.query`. */
  query: Record<string, QueryTableMock>;
  transaction: Mock<(cb: (tx: TxMock) => unknown) => unknown>;
  $count: Mock;
}

/**
 * Build a fake Drizzle `db`. The same statement fns back both `db` and the `tx`
 * handed to `transaction(cb)`, so a test can assert on `db.insert` regardless of
 * whether the write ran at top level or inside the transaction. Each statement
 * fn returns a {@link chainable} by default; override per-test for `.returning()`
 * results (e.g. `db.insert.mockReturnValue(chainable([{ id: "r1" }]))`).
 */
export function createDbMock(
  extraTables: readonly string[] = [],
): DbMock {
  const tables = [...new Set([...DEFAULT_TABLES, ...extraTables])];
  const query = makeQuery(tables);

  const insert = vi.fn(
    (_table?: unknown): InsertBuilder => ({
      values: (_vals?: unknown) => chainable(),
    }),
  );
  const update = vi.fn(
    (_table?: unknown): UpdateBuilder => ({
      set: (_vals?: unknown) => ({
        where: (_where?: unknown) => Promise.resolve(undefined),
      }),
    }),
  );
  const del = vi.fn(
    (_table?: unknown): DeleteBuilder => ({
      where: (_where?: unknown) => Promise.resolve(undefined),
    }),
  );
  const select = vi.fn(
    (..._columns: unknown[]): SelectBuilder => ({
      from: (_table?: unknown) => ({
        where: (_where?: unknown) => Promise.resolve([]),
      }),
    }),
  );
  const $count = vi.fn();

  const tx: TxMock = {
    query,
    insert,
    update,
    delete: del,
    select,
    // A SAVEPOINT runs against the same fake surface.
    transaction: vi.fn((cb: (t: TxMock) => unknown) => cb(tx)),
  };

  const transaction = vi.fn((cb: (t: TxMock) => unknown) => cb(tx));

  return {
    db: { query, insert, update, delete: del, select, transaction, $count },
    tx,
    query,
    insert,
    update,
    delete: del,
    select,
    transaction,
    $count,
  };
}

// --- Proxy-backed module shims (dodge the import-time hoisting trap) ----------

let activeDb: DbMock | null = null;

/** Install (and return) the db mock the code under test will see this test. */
export function useDbMock(mock: DbMock = createDbMock()): DbMock {
  activeDb = mock;
  return mock;
}

const dbProxy = new Proxy(
  {},
  {
    get(_t, prop) {
      if (!activeDb)
        throw new Error("useDbMock() must run before the db is accessed");
      return activeDb.db[prop as keyof DbMock["db"]];
    },
  },
) as unknown as TxMock & { $count: Mock };

/**
 * Module shim for `vi.mock("~/server/db", …)`. Returns a stable `db` proxy that
 * forwards to whatever {@link useDbMock} last installed, plus `isDbConfigured`.
 */
export function dbModuleMock(over: { isDbConfigured?: boolean } = {}) {
  return {
    db: dbProxy,
    isDbConfigured: () => over.isDbConfigured ?? true,
  };
}

let activeUser: User | null = null;

/** Set the user `requireUser`/`getCurrentUser` resolve to (null = signed out). */
export function useAuthMock(user: User | null): void {
  activeUser = user;
}

/**
 * Module shim for `vi.mock("~/server/auth", …)`. `requireUser` resolves to the
 * active user (throwing `UNAUTHENTICATED` when signed out); `getCurrentUser`
 * resolves to the active user or `null`.
 */
export function authModuleMock() {
  return {
    requireUser: vi.fn(async (): Promise<User> => {
      if (!activeUser) throw new Error("UNAUTHENTICATED");
      return activeUser;
    }),
    getCurrentUser: vi.fn(async (): Promise<User | null> => activeUser),
  };
}

/**
 * Convenience returning an inline `~/server/auth` mock object for tests that
 * prefer a one-liner over the proxy shim. Mirrors the AC's `mockAuth({ user })`.
 */
export function mockAuth(opts: { user?: User | null } = {}) {
  const user = opts.user ?? null;
  return {
    requireUser: vi.fn(async (): Promise<User> => {
      if (!user) throw new Error("UNAUTHENTICATED");
      return user;
    }),
    getCurrentUser: vi.fn(async (): Promise<User | null> => user),
  };
}
