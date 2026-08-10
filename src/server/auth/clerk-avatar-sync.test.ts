import { beforeEach, describe, expect, it, vi } from "vitest";

import { PgDialect } from "drizzle-orm/pg-core";

import { useDbMock, type DbMock } from "~/test/harness";

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", async () =>
  (await import("~/test/harness")).dbModuleMock(),
);

import { applyClerkUserUpdate } from "~/server/auth";

/**
 * The Clerk sync must not clobber a photo the user chose inside Heirloom
 * (issue #659). The guard lives in SQL inside the same UPDATE, so the assertion
 * is on the generated statement rather than on a resulting row: render the
 * `avatar_url` assignment and check it is conditional on `avatar_user_managed`.
 * If anyone reverts it to a plain assignment this fails loudly.
 */
describe("applyClerkUserUpdate", () => {
  let db: DbMock;
  let assigned: Record<string, unknown> | undefined;

  beforeEach(() => {
    db = useDbMock();
    assigned = undefined;
    db.update.mockImplementation(() => ({
      set: (vals?: unknown) => {
        assigned = vals as Record<string, unknown>;
        return { where: () => Promise.resolve(undefined) };
      },
    }));
  });

  const profile = {
    email: "cook@example.com",
    name: "Home Cook",
    handle: "home-cook",
    avatarUrl: "https://img.clerk.com/new.png",
  };

  function avatarSql() {
    // The runtime db is created with `casing: "snake_case"`; a bare dialect
    // renders the schema property names instead, so compare case-insensitively
    // with underscores stripped rather than pinning one spelling.
    const dialect = new PgDialect();
    const query = dialect.sqlToQuery(
      assigned?.avatarUrl as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    return {
      ...query,
      normalized: query.sql.toLowerCase().replaceAll("_", ""),
    };
  }

  it("leaves a user-managed avatar alone while syncing the rest", async () => {
    await applyClerkUserUpdate("clerk_1", profile);

    expect(assigned?.email).toBe(profile.email);
    expect(assigned?.name).toBe(profile.name);
    expect(assigned?.handle).toBe(profile.handle);

    const { normalized, params } = avatarSql();
    expect(normalized).toContain("avatarusermanaged");
    expect(normalized).toMatch(/case\s+when/);
    expect(normalized).toContain("avatarurl");
    expect(params).toContain(profile.avatarUrl);
  });

  it("still lets Clerk set the avatar when the user has not picked one", async () => {
    await applyClerkUserUpdate("clerk_1", profile);

    // The `else` branch is the Clerk value, so an untouched account keeps
    // mirroring the identity provider exactly as it did before #659.
    expect(avatarSql().normalized).toMatch(/else\s+\$1\s+end/);
  });

  it("does nothing without a clerk id", async () => {
    await applyClerkUserUpdate("", profile);

    expect(db.update).not.toHaveBeenCalled();
  });
});
