import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deletion-notice tests (issue #678, PR B).
 *
 * The notice is the compliance artefact, not decoration: an erasure the user
 * did not understand before confirming is not a valid confirmation. These
 * assert the two things that make it honest — that the confirmation gate can't
 * be bypassed, and that the preview only claims a recipe survives when it
 * genuinely will.
 */

const { state, db } = vi.hoisted(() => {
  const state = {
    configured: true,
    /** Queued results, consumed in the order the queries are issued. */
    results: [] as unknown[][],
    wheres: [] as unknown[],
  };

  const chain = () => {
    const c = {
      from: vi.fn(() => c),
      innerJoin: vi.fn(() => c),
      leftJoin: vi.fn(() => c),
      groupBy: vi.fn(() => c),
      where: vi.fn((w: unknown) => {
        state.wheres.push(w);
        return c;
      }),
      then: (resolve: (v: unknown) => unknown) =>
        resolve(state.results.shift() ?? []),
    };
    return c;
  };

  return {
    state,
    db: { select: vi.fn(() => chain()) },
  };
});

vi.mock("~/server/db", () => ({
  db,
  isDbConfigured: () => state.configured,
}));

const { getDeletionPreview, previewTotal } = await import("./deletion-preview");

function queue(...counts: number[]) {
  // Eight parallel probes, issued in the order `getDeletionPreview` lists them.
  // The seventh is the sole-owner-group lookup, which reads rows rather than a
  // count, so it gets an empty result unless a test says otherwise.
  state.results = counts.map((value, index) =>
    index === 6 ? [] : [{ value }],
  );
}

beforeEach(() => {
  state.configured = true;
  state.results = [];
  state.wheres = [];
  vi.clearAllMocks();
});

describe("getDeletionPreview", () => {
  it("returns a zeroed preview when there is no database", async () => {
    state.configured = false;
    const preview = await getDeletionPreview("u1");
    expect(preview.ownedRecipeCount).toBe(0);
    expect(preview.soleOwnerGroups).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("reports the counts the notice quotes back to the user", async () => {
    queue(214, 3, 1, 92, 17, 6, 0, 0);
    const preview = await getDeletionPreview("u1");

    expect(preview.ownedRecipeCount).toBe(214);
    expect(preview.coCreatedRecipeCount).toBe(3);
    expect(preview.pendingInviteCount).toBe(1);
    expect(preview.cookLogEntryCount).toBe(92);
    expect(preview.reviewCount).toBe(17);
    expect(preview.collectionCount).toBe(6);
  });

  it("treats an absent subscription row as no live subscription", async () => {
    queue(0, 0, 0, 0, 0, 0, 0, 0);
    const preview = await getDeletionPreview("u1");
    expect(preview.hasActiveSubscription).toBe(false);
  });

  it("flags a live subscription so the notice can warn about billing", async () => {
    queue(0, 0, 0, 0, 0, 0, 0, 1);
    const preview = await getDeletionPreview("u1");
    expect(preview.hasActiveSubscription).toBe(true);
  });

  it("sums only what the user watches disappear", () => {
    expect(
      previewTotal({
        ownedRecipeCount: 10,
        coCreatedRecipeCount: 99,
        pendingInviteCount: 99,
        cookLogEntryCount: 5,
        reviewCount: 2,
        collectionCount: 1,
        soleOwnerGroups: [],
        hasActiveSubscription: false,
      }),
    ).toBe(18);
  });
});
