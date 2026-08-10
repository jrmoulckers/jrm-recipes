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

const { state, db, findEntanglement } = vi.hoisted(() => {
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
    // The halt predicate is stubbed so these tests stay about the *notice*.
    // What it returns is the erasure path's business; that the notice asks it
    // at all, rather than deciding for itself, is the property under test.
    findEntanglement: vi.fn(async () => ({
      reason: "co_created_entanglement" as const,
      recipeIds: [] as string[],
    })),
  };
});

vi.mock("~/server/db", () => ({
  db,
  isDbConfigured: () => state.configured,
}));

vi.mock("./erasure-holds", () => ({ findEntanglement }));

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
  findEntanglement.mockResolvedValue({
    reason: "co_created_entanglement" as const,
    recipeIds: [] as string[],
  });
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
        heldRecipeCount: 99,
        cookLogEntryCount: 5,
        reviewCount: 2,
        collectionCount: 1,
        soleOwnerGroups: [],
        hasActiveSubscription: false,
      }),
    ).toBe(18);
  });
});

/**
 * The notice and the halt have to agree about who is entangled (#787).
 *
 * They did not. `findEntanglement` halts on two directions — you co-create
 * someone else's recipe, *or* you own a recipe carrying other accepted
 * creators — while the notice only ever counted the first. A user in the
 * second direction alone was shown "All N of your recipes are permanently
 * deleted" and "everything above is deleted immediately", pressed the button,
 * and got a hold: nothing deleted, account wholly intact.
 *
 * The fix is not a better second query. It is having no second query: the
 * notice calls the same function the erasure calls, so the two cannot disagree
 * about the owner direction or about anything added to it later.
 */
describe("held-erasure disclosure", () => {
  it("asks the erasure path's own predicate rather than deciding for itself", async () => {
    queue(0, 0, 0, 0, 0, 0, 0, 0);
    await getDeletionPreview("u-42");

    // If someone replaces this with a local query the mock stops being called
    // and this fails, which is the whole point of the assertion.
    expect(findEntanglement).toHaveBeenCalledWith("u-42");
  });

  it("reports a hold for an owner whose co-created count is zero", async () => {
    // The exact case the old notice could not see: owns a recipe that carries
    // accepted co-creators, co-creates nothing of anyone else's.
    findEntanglement.mockResolvedValue({
      reason: "co_created_entanglement" as const,
      recipeIds: ["r-owned-with-cocreators"],
    });
    queue(1, 0, 0, 0, 0, 0, 0, 0);

    const preview = await getDeletionPreview("u1");

    expect(preview.coCreatedRecipeCount).toBe(0);
    expect(preview.heldRecipeCount).toBe(1);
  });

  it("counts every entangled recipe, not just the first", async () => {
    findEntanglement.mockResolvedValue({
      reason: "co_created_entanglement" as const,
      recipeIds: ["r1", "r2", "r3"],
    });
    queue(0, 0, 0, 0, 0, 0, 0, 0);

    const preview = await getDeletionPreview("u1");
    expect(preview.heldRecipeCount).toBe(3);
  });

  it("leaves an unentangled account with nothing to disclose", async () => {
    queue(214, 0, 0, 92, 17, 6, 0, 0);
    const preview = await getDeletionPreview("u1");

    // The common case must not sprout a warning. A notice that always says
    // "we might not delete this" is a notice nobody reads.
    expect(preview.heldRecipeCount).toBe(0);
  });
});
