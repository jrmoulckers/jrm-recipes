import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Containment detection tests (issue #694).
 *
 * `eraseUserAccount` halts on whatever this module reports, so a false negative
 * here is not a missed guard — it is an irreversible deletion of the evidence
 * needed to remedy the co-creator gap. These assert the two directions of
 * entanglement, the `pending` exclusion, and that a repeat request updates the
 * standing hold rather than multiplying the backlog.
 */

const { state, db } = vi.hoisted(() => {
  const state = {
    /** Rows returned to successive `db.select()` calls, in order. */
    selects: [] as unknown[][],
    inserted: null as Record<string, unknown> | null,
    conflict: null as Record<string, unknown> | null,
  };

  const selectChain = () => {
    const chain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      then: (resolve: (v: unknown) => unknown) =>
        resolve(state.selects.shift() ?? []),
    };
    return chain;
  };

  const insertChain = () => {
    const chain = {
      values: vi.fn((v: Record<string, unknown>) => {
        state.inserted = v;
        return chain;
      }),
      onConflictDoUpdate: vi.fn(async (c: Record<string, unknown>) => {
        state.conflict = c;
      }),
    };
    return chain;
  };

  const db = {
    select: vi.fn(() => selectChain()),
    insert: vi.fn(() => insertChain()),
  };

  return { state, db };
});

vi.mock("~/server/db", () => ({ db, isDbConfigured: () => true }));
vi.mock("~/env", () => ({ env: { DELETION_HASH_SALT: "salt-long-enough" } }));

import {
  findEntanglement,
  getErasureBacklog,
  recordErasureHold,
} from "./erasure-holds";

beforeEach(() => {
  state.selects = [];
  state.inserted = null;
  state.conflict = null;
  vi.clearAllMocks();
});

describe("findEntanglement", () => {
  it("reports nothing for a user who shares no recipes", async () => {
    state.selects = [[], []];
    expect((await findEntanglement("u1")).recipeIds).toEqual([]);
  });

  it("catches recipes the user co-creates but does not own", async () => {
    // Since #685 they could have edited the body, so their prose may sit in a
    // recipe that survives the erasure with nothing naming them.
    state.selects = [[{ recipeId: "r9" }], []];
    expect((await findEntanglement("u1")).recipeIds).toEqual(["r9"]);
  });

  it("catches recipes the user owns that carry other accepted creators", async () => {
    // The other direction, and it is not symmetrical: erasure deletes this
    // recipe, and with it every co-creator's version rows on it — including the
    // ones evidencing which words were the departing owner's.
    state.selects = [[], [{ recipeId: "r3" }]];
    expect((await findEntanglement("u1")).recipeIds).toEqual(["r3"]);
  });

  it("returns each entangled recipe once when both directions match", async () => {
    state.selects = [[{ recipeId: "r9" }], [{ recipeId: "r9" }]];
    expect((await findEntanglement("u1")).recipeIds).toEqual(["r9"]);
  });

  it("queries both directions even when the first one already matched", async () => {
    state.selects = [[{ recipeId: "r9" }], [{ recipeId: "r3" }]];

    const result = await findEntanglement("u1");

    // Short-circuiting after the first hit would under-report the worklist the
    // eventual remedy has to cover, which is the point of recording ids at all.
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(result.recipeIds).toEqual(["r3", "r9"]);
  });
});

describe("recordErasureHold", () => {
  it("stores the worklist, trigger and notice version", async () => {
    await recordErasureHold(
      "u1",
      { reason: "co_created_entanglement", recipeIds: ["r9"] },
      { trigger: "in_app", noticeVersion: "delete-account-v1" },
    );

    expect(state.inserted).toMatchObject({
      userId: "u1",
      trigger: "in_app",
      reason: "co_created_entanglement",
      entangledRecipeIds: ["r9"],
      noticeVersion: "delete-account-v1",
    });
  });

  it("upserts on the subject so Clerk retries do not inflate the backlog", async () => {
    await recordErasureHold(
      "u1",
      { reason: "co_created_entanglement", recipeIds: ["r9"] },
      { trigger: "clerk_webhook" },
    );

    // Clerk redelivers `user.deleted`. Each delivery is the same standing
    // request, and "N pending erasures" is only defensible if N counts people.
    expect(state.conflict).not.toBeNull();
    expect(state.conflict?.set).toMatchObject({ releasedAt: null });
  });
});

describe("getErasureBacklog", () => {
  it("counts open holds and how long the oldest has waited", async () => {
    const oldest = new Date("2026-08-01T00:00:00.000Z");
    state.selects = [
      [
        { firstRequestedAt: oldest, entangledRecipeIds: ["r9", "r3"] },
        {
          firstRequestedAt: new Date("2026-08-05T00:00:00.000Z"),
          entangledRecipeIds: ["r12"],
        },
      ],
    ];

    expect(await getErasureBacklog()).toEqual({
      open: 2,
      oldestRequestedAt: oldest.toISOString(),
      totalEntangledRecipes: 3,
    });
  });

  it("reports an empty backlog rather than throwing when nothing is held", async () => {
    state.selects = [[]];
    expect(await getErasureBacklog()).toEqual({
      open: 0,
      oldestRequestedAt: null,
      totalEntangledRecipes: 0,
    });
  });
});
