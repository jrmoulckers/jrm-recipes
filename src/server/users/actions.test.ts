import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deletion action tests (issue #678, PR B).
 *
 * The gate is the point: erasure is instantaneous and irreversible, so a
 * mistyped or absent confirmation must never reach {@link eraseUserAccount}.
 * The rest asserts the two failure shapes that matter — a purge failure has to
 * say "nothing was deleted" truthfully, and a Clerk failure after the data is
 * gone must not report the deletion as failed.
 */

const { state, eraseUserAccount, requireUser, deleteUser } = vi.hoisted(() => {
  const state = {
    configured: true,
    eraseError: null as Error | null,
    clerkError: null as Error | null,
    /** What the erasure reports. `held` is the #694 containment outcome. */
    eraseStatus: "erased" as "erased" | "held",
  };
  return {
    state,
    eraseUserAccount: vi.fn(async () => {
      if (state.eraseError) throw state.eraseError;
      return {
        status: state.eraseStatus,
        counts: {},
        retainedRecipeCount: 0,
        purgedAssetCount: 0,
      };
    }),
    requireUser: vi.fn(async () => ({ id: "u1", clerkId: "clerk_1" })),
    deleteUser: vi.fn(async () => {
      if (state.clerkError) throw state.clerkError;
    }),
  };
});

vi.mock("~/server/auth", () => ({ requireUser }));
vi.mock("~/server/db", () => ({ isDbConfigured: () => state.configured }));
vi.mock("~/server/users/erasure", () => ({ eraseUserAccount }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { deleteUser } }),
}));

const { deleteAccountAction } = await import("./actions");
const { DELETION_NOTICE_VERSION } = await import("./deletion-notice");

beforeEach(() => {
  state.configured = true;
  state.eraseError = null;
  state.clerkError = null;
  state.eraseStatus = "erased";
  vi.clearAllMocks();
});

describe("deleteAccountAction", () => {
  it("refuses an empty confirmation without touching the erasure path", async () => {
    const result = await deleteAccountAction("");
    expect(result.ok).toBe(false);
    expect(eraseUserAccount).not.toHaveBeenCalled();
  });

  it("refuses a near-miss confirmation", async () => {
    const result = await deleteAccountAction("delet");
    expect(result).toMatchObject({ ok: false, code: "CONFIRMATION_MISMATCH" });
    expect(eraseUserAccount).not.toHaveBeenCalled();
  });

  it("accepts the phrase regardless of case and surrounding space", async () => {
    const result = await deleteAccountAction("  delete  ");
    expect(result.ok).toBe(true);
    expect(eraseUserAccount).toHaveBeenCalledTimes(1);
  });

  it("records which notice the user agreed to", async () => {
    await deleteAccountAction("DELETE");
    expect(eraseUserAccount).toHaveBeenCalledWith("u1", {
      trigger: "in_app",
      noticeVersion: DELETION_NOTICE_VERSION,
    });
  });

  it("removes the Clerk identity so the account cannot be lazily recreated", async () => {
    await deleteAccountAction("DELETE");
    expect(deleteUser).toHaveBeenCalledWith("clerk_1");
  });

  it("deletes app data before the identity", async () => {
    const order: string[] = [];
    eraseUserAccount.mockImplementationOnce(async () => {
      order.push("erase");
      return {
        status: "erased" as const,
        counts: {},
        retainedRecipeCount: 0,
        purgedAssetCount: 0,
      };
    });
    deleteUser.mockImplementationOnce(async () => {
      order.push("clerk");
    });

    await deleteAccountAction("DELETE");
    expect(order).toEqual(["erase", "clerk"]);
  });

  it("reports a purge failure truthfully as nothing having been deleted", async () => {
    state.eraseError = new Error("MEDIA_PURGE_INCOMPLETE: 3 asset(s) survived");
    const result = await deleteAccountAction("DELETE");

    expect(result).toMatchObject({ ok: false, code: "MEDIA_PURGE_INCOMPLETE" });
    if (!result.ok) expect(result.error).toContain("Nothing has been lost");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("still reports success when Clerk fails after the data is already gone", async () => {
    state.clerkError = new Error("clerk down");
    const result = await deleteAccountAction("DELETE");

    // The data is deleted. Calling that a failure would invite the user to
    // retry a deletion that already succeeded.
    expect(result.ok).toBe(true);
  });

  it("refuses when there is no database rather than pretending to delete", async () => {
    state.configured = false;
    const result = await deleteAccountAction("DELETE");
    expect(result.ok).toBe(false);
    expect(eraseUserAccount).not.toHaveBeenCalled();
  });

  /**
   * A held erasure (#694) deleted nothing, so the Clerk identity has to stay
   * too. Removing it would leave a person unable to sign in to an account whose
   * data is still there — the half-erased state the whole ordering exists to
   * avoid — and it is not reported as success, because nothing was deleted.
   */
  it("reports a held erasure honestly and leaves the Clerk identity alone", async () => {
    state.eraseStatus = "held";

    const result = await deleteAccountAction("DELETE");

    expect(result).toMatchObject({ ok: false, code: "ERASURE_HELD" });
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
