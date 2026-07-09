import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock, canManageMock, resolveTargetMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  canManageMock: vi.fn(),
  resolveTargetMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: { transaction: transactionMock },
}));
vi.mock("~/server/groups/queries", () => ({ canManage: canManageMock }));
vi.mock("./targets", () => ({ resolveTarget: resolveTargetMock }));

import { type User } from "~/server/db/schema";
import { dismissReport, hideContent } from "./mutations";

const manager = { id: "owner_1" } as unknown as User;

const group = { id: "group_1" };

const target = {
  targetType: "comment" as const,
  targetId: "comment_1",
  authorId: "author_9",
  recipeId: "recipe_1",
  recipe: { authorId: "author_9", visibility: "group", groupId: "group_1" },
  preview: "reported comment",
  hiddenAt: null,
};

function fakeTx(opts: { role?: string | null }) {
  const chain = {
    set: vi.fn(() => chain),
    where: vi.fn(async () => undefined),
  };
  return {
    chain,
    query: {
      groups: { findFirst: vi.fn(async () => group) },
      groupMembers: {
        findFirst: vi.fn(async () =>
          opts.role === null ? undefined : { role: opts.role ?? "owner" },
        ),
      },
    },
    update: vi.fn(() => chain),
  };
}

function runWith(tx: unknown) {
  transactionMock.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveTargetMock.mockResolvedValue(target);
});

describe("hideContent gating (#357)", () => {
  it("rejects a member who cannot manage the group", async () => {
    runWith(fakeTx({ role: "member" }));
    canManageMock.mockReturnValue(false);

    await expect(
      hideContent(
        { targetType: "comment", targetId: "comment_1", groupSlug: "fam" },
        manager,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("hides a target that belongs to the manager's group", async () => {
    const tx = fakeTx({ role: "owner" });
    runWith(tx);
    canManageMock.mockReturnValue(true);

    await hideContent(
      { targetType: "comment", targetId: "comment_1", groupSlug: "fam" },
      manager,
    );

    // One update for the comment row (hide) + one for its reports (resolve).
    expect(tx.update).toHaveBeenCalledTimes(2);
  });

  it("refuses to hide a target from another group", async () => {
    runWith(fakeTx({ role: "owner" }));
    canManageMock.mockReturnValue(true);
    resolveTargetMock.mockResolvedValue({
      ...target,
      recipe: { ...target.recipe, groupId: "group_OTHER" },
    });

    await expect(
      hideContent(
        { targetType: "comment", targetId: "comment_1", groupSlug: "fam" },
        manager,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("dismissReport gating (#357)", () => {
  it("rejects a non-manager", async () => {
    runWith(fakeTx({ role: "member" }));
    canManageMock.mockReturnValue(false);

    await expect(
      dismissReport(
        { targetType: "comment", targetId: "comment_1", groupSlug: "fam" },
        manager,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("marks the target's open reports dismissed for a manager", async () => {
    const tx = fakeTx({ role: "admin" });
    runWith(tx);
    canManageMock.mockReturnValue(true);

    await dismissReport(
      { targetType: "comment", targetId: "comment_1", groupSlug: "fam" },
      manager,
    );

    expect(tx.update).toHaveBeenCalledTimes(1);
  });
});
