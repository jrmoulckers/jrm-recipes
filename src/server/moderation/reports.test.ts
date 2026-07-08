import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock, resolveTargetMock, canViewRecipeMock, notifyManyMock } =
  vi.hoisted(() => ({
    transactionMock: vi.fn(),
    resolveTargetMock: vi.fn(),
    canViewRecipeMock: vi.fn(),
    notifyManyMock: vi.fn(),
  }));

vi.mock("~/server/db", () => ({
  db: { transaction: transactionMock },
}));
vi.mock("./targets", () => ({ resolveTarget: resolveTargetMock }));
vi.mock("~/server/recipes/queries", () => ({
  canViewRecipe: canViewRecipeMock,
}));
vi.mock("~/server/notifications/notify", () => ({
  notifyMany: notifyManyMock,
}));

import { type User } from "~/server/db/schema";
import { reportContent } from "./reports";

const reporter = { id: "reporter_1" } as unknown as User;

const target = {
  targetType: "comment" as const,
  targetId: "comment_1",
  authorId: "author_9",
  recipeId: "recipe_1",
  recipe: { authorId: "author_9", visibility: "group", groupId: "group_1" },
  preview: "a mean comment",
  hiddenAt: null,
};

/** Fake tx: canned group members + an insert chain whose returning we control. */
function fakeTx(opts: { members?: unknown[]; returning?: unknown[] }) {
  const chain = {
    values: vi.fn(() => chain),
    onConflictDoNothing: vi.fn(() => chain),
    returning: vi.fn(async () => opts.returning ?? [{ id: "report_1" }]),
  };
  return {
    chain,
    query: {
      groupMembers: {
        findMany: vi.fn(async () => opts.members ?? []),
      },
    },
    insert: vi.fn(() => chain),
  };
}

function runWith(tx: unknown) {
  transactionMock.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveTargetMock.mockResolvedValue(target);
  canViewRecipeMock.mockResolvedValue(true);
});

describe("reportContent (#356)", () => {
  it("files a report and notifies the group's owners/admins", async () => {
    const tx = fakeTx({
      members: [
        { userId: "reporter_1", role: "member" },
        { userId: "owner_1", role: "owner" },
        { userId: "admin_1", role: "admin" },
        { userId: "other", role: "member" },
      ],
      returning: [{ id: "report_1" }],
    });
    runWith(tx);

    const result = await reportContent(
      { targetType: "comment", targetId: "comment_1", reason: "harassment" },
      reporter,
    );

    expect(result.created).toBe(true);
    expect(notifyManyMock).toHaveBeenCalledTimes(1);
    const [, recipients] = notifyManyMock.mock.calls[0] as [unknown, string[]];
    expect(recipients.sort()).toEqual(["admin_1", "owner_1"]);
  });

  it("treats a duplicate report as a no-op (no new row, no notification)", async () => {
    const tx = fakeTx({
      members: [{ userId: "owner_1", role: "owner" }],
      returning: [], // onConflictDoNothing short-circuited -> no row
    });
    runWith(tx);

    const result = await reportContent(
      { targetType: "comment", targetId: "comment_1", reason: "spam" },
      reporter,
    );

    expect(result.created).toBe(false);
    expect(notifyManyMock).not.toHaveBeenCalled();
  });

  it("rejects reporting your own content", async () => {
    resolveTargetMock.mockResolvedValue({ ...target, authorId: reporter.id });
    runWith(fakeTx({}));

    await expect(
      reportContent(
        { targetType: "comment", targetId: "comment_1", reason: "other" },
        reporter,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("rejects a reporter who cannot view the recipe", async () => {
    canViewRecipeMock.mockResolvedValue(false);
    runWith(fakeTx({}));

    await expect(
      reportContent(
        { targetType: "comment", targetId: "comment_1", reason: "other" },
        reporter,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("throws NOT_FOUND when the target no longer exists", async () => {
    resolveTargetMock.mockResolvedValue(null);
    runWith(fakeTx({}));

    await expect(
      reportContent(
        { targetType: "comment", targetId: "gone", reason: "other" },
        reporter,
      ),
    ).rejects.toThrow("NOT_FOUND");
  });
});
