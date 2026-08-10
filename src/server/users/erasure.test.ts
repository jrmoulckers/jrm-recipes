import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Erasure orchestration tests (issue #678).
 *
 * These assert the *ordering and completeness* guarantees, which are the part
 * that has to be right: media bytes destroyed before the rows that name them,
 * third parties' content preserved, a loud failure instead of a silent partial
 * deletion, and a tombstone that carries no identifier.
 */

const { state, db, purge, envMock } = vi.hoisted(() => {
  const state = {
    configured: true,
    user: undefined as
      { id: string; clerkId: string | null; email: string | null } | undefined,
    /** Every mutating call, in order, as `"<verb> <table>"`. */
    calls: [] as string[],
    selects: [] as unknown[][],
    inserted: null as Record<string, unknown> | null,
    purgeFailed: [] as string[],
    userSurvives: false,
  };

  const table = (t: unknown) =>
    // Drizzle stores the table name under a well-known symbol; `getTableName`
    // just reads it. Can't import here (this block is hoisted above imports).
    (t as Record<symbol, string>)?.[Symbol.for("drizzle:Name")] ?? "unknown";

  const makeChain = (verb: string, t: unknown) => {
    const chain = {
      set: vi.fn(() => chain),
      values: vi.fn((v: Record<string, unknown>) => {
        state.inserted = v;
        return chain;
      }),
      onConflictDoNothing: vi.fn(async () => undefined),
      where: vi.fn(() => chain),
      returning: vi.fn(async () => {
        state.calls.push(`${verb} ${table(t)}`);
        return [{ id: "x" }];
      }),
      then: (resolve: (v: unknown) => unknown) => {
        state.calls.push(`${verb} ${table(t)}`);
        return resolve(undefined);
      },
    };
    return chain;
  };

  const selectChain = () => {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(async () => state.selects.shift() ?? []),
      then: (resolve: (v: unknown) => unknown) =>
        resolve(state.selects.shift() ?? []),
    };
    return chain;
  };

  const db = {
    query: {
      users: { findFirst: vi.fn(async () => state.user) },
    },
    select: vi.fn(() => selectChain()),
    insert: vi.fn((t: unknown) => makeChain("insert", t)),
    update: vi.fn((t: unknown) => makeChain("update", t)),
    delete: vi.fn((t: unknown) => makeChain("delete", t)),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      state.calls.push("BEGIN");
      await fn(db);
      state.calls.push("COMMIT");
    }),
  };

  const purge = {
    purgeUserMedia: vi.fn(async () => {
      state.calls.push("purge cloudinary");
      return { purged: 3, failed: state.purgeFailed, skippedExternal: 0 };
    }),
    isPurgeComplete: (r: { failed: string[] }) => r.failed.length === 0,
    deleteUserMediaRows: vi.fn(async () => {
      state.calls.push("delete media_assets");
      return 3;
    }),
  };

  const envMock = { env: { DELETION_HASH_SALT: "a-sufficiently-long-salt" } };

  return { state, db, purge, envMock };
});

vi.mock("~/server/db", () => ({ db, isDbConfigured: () => state.configured }));
vi.mock("~/server/media/purge", () => purge);
vi.mock("~/env", () => envMock);

import { eraseUserAccount, hashDeletionSubject } from "./erasure";

beforeEach(() => {
  state.configured = true;
  state.user = { id: "u1", clerkId: "clerk_1", email: "nonna@example.com" };
  state.calls = [];
  state.selects = [];
  state.inserted = null;
  state.purgeFailed = [];
  state.userSurvives = false;
  vi.clearAllMocks();
});

/**
 * Queue the sequence of `db.select()` results the orchestrator reads, in the
 * order it reads them.
 */
function queueSelects(options?: {
  owned?: { id: string }[];
  coCreated?: { recipeId: string }[];
  rated?: { recipeId: string }[];
  comments?: { id: string }[];
}) {
  state.selects = [
    options?.owned ?? [],
    options?.coCreated ?? [],
    options?.rated ?? [],
    options?.comments ?? [],
    // Post-transaction assertions: users row gone, no orphan recipes.
    [],
    [],
  ];
}

describe("eraseUserAccount", () => {
  it("destroys media bytes before deleting the rows that name them", async () => {
    queueSelects({ owned: [{ id: "r1" }] });
    await eraseUserAccount("u1", { trigger: "clerk_webhook" });

    const purgeAt = state.calls.indexOf("purge cloudinary");
    const mediaRowsAt = state.calls.indexOf("delete media_assets");
    const usersAt = state.calls.indexOf("delete users");

    expect(purgeAt).toBeGreaterThanOrEqual(0);
    // Bytes first. Reversing this strands live CDN images with nothing left
    // pointing at them, which is the failure `restrict` exists to prevent.
    expect(purgeAt).toBeLessThan(mediaRowsAt);
    expect(mediaRowsAt).toBeLessThan(usersAt);
  });

  it("deletes the user's own recipes before the users row", async () => {
    queueSelects({ owned: [{ id: "r1" }, { id: "r2" }] });
    await eraseUserAccount("u1", { trigger: "in_app" });

    const recipesAt = state.calls.indexOf("delete recipes");
    const usersAt = state.calls.indexOf("delete users");
    expect(recipesAt).toBeGreaterThanOrEqual(0);
    expect(recipesAt).toBeLessThan(usersAt);
  });

  it("refuses to delete anything when media bytes survived", async () => {
    state.purgeFailed = ["heirloom/a1"];
    queueSelects();

    await expect(
      eraseUserAccount("u1", { trigger: "clerk_webhook" }),
    ).rejects.toThrow(/MEDIA_PURGE_INCOMPLETE/);

    // A retryable partial failure, not a half-erased account.
    expect(state.calls).not.toContain("delete users");
    expect(state.calls).not.toContain("BEGIN");
  });

  it("counts co-created recipes the user does not own as retained", async () => {
    queueSelects({
      owned: [{ id: "r1" }],
      // `r1` is their own; only `r9` is somebody else's recipe they co-create.
      coCreated: [{ recipeId: "r1" }, { recipeId: "r9" }],
    });

    const result = await eraseUserAccount("u1", { trigger: "in_app" });
    expect(result.retainedRecipeCount).toBe(1);
  });

  it("is a no-op for an already-erased subject", async () => {
    state.user = undefined;
    const result = await eraseUserAccount("u1", { trigger: "clerk_webhook" });

    // Clerk retries `user.deleted`; throwing here would make it redeliver
    // forever against an account that is already gone.
    expect(result.counts).toEqual({});
    expect(state.calls).toEqual([]);
  });

  it("refuses to run when the database is unconfigured", async () => {
    state.configured = false;
    await expect(eraseUserAccount("u1", { trigger: "admin" })).rejects.toThrow(
      /NOT_CONFIGURED/,
    );
  });

  it("writes a tombstone carrying only hashes and counts", async () => {
    queueSelects({ owned: [{ id: "r1" }] });
    await eraseUserAccount("u1", {
      trigger: "in_app",
      noticeVersion: "delete-account-v1",
    });

    const row = state.inserted!;
    expect(row.subjectHash).toBe(hashDeletionSubject("u1"));
    expect(row.clerkIdHash).toBe(hashDeletionSubject("clerk_1"));
    expect(row.noticeVersion).toBe("delete-account-v1");
    expect(row.completedAt).toBeInstanceOf(Date);

    // The tombstone outlives the data it describes, so it must not re-create
    // the identifiers the erasure just removed.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("u1");
    expect(serialized).not.toContain("clerk_1");
    expect(serialized).not.toContain("nonna@example.com");
  });
});

describe("hashDeletionSubject", () => {
  it("is deterministic so a restored row can be matched back", () => {
    expect(hashDeletionSubject("u1")).toBe(hashDeletionSubject("u1"));
  });

  it("is salt-dependent, so a bare id hash is not confirmable", () => {
    expect(hashDeletionSubject("u1", "salt-one-long-enough")).not.toBe(
      hashDeletionSubject("u1", "salt-two-long-enough"),
    );
  });

  it("returns null rather than a guessable digest when no salt is set", () => {
    expect(hashDeletionSubject("u1", "")).toBeNull();
  });
});
