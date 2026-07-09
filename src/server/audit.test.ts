import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertMock, valuesMock } = vi.hoisted(() => {
  const valuesMock = vi.fn(async () => undefined);
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  return { insertMock, valuesMock };
});

vi.mock("~/server/db", () => ({
  db: { insert: insertMock },
}));

import { AuditAction, recordAudit } from "./audit";
import { db } from "~/server/db";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordAudit (#219)", () => {
  it("writes a normalized row with nulls for omitted fields", async () => {
    await recordAudit(db, {
      actorId: "user_1",
      action: AuditAction.RecipeDeleted,
      targetType: "recipe",
      targetId: "recipe_1",
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith({
      actorId: "user_1",
      action: "recipe.deleted",
      targetType: "recipe",
      targetId: "recipe_1",
      metadata: null,
      ipAddress: null,
      userAgent: null,
    });
  });

  it("passes through metadata and request context", async () => {
    await recordAudit(db, {
      actorId: null,
      action: AuditAction.GroupMemberRoleUpdated,
      targetType: "group",
      targetId: "group_1",
      metadata: { from: "member", to: "admin" },
      ipAddress: "203.0.113.5",
      userAgent: "curl/8",
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        action: "group.member_role_updated",
        metadata: { from: "member", to: "admin" },
        ipAddress: "203.0.113.5",
        userAgent: "curl/8",
      }),
    );
  });

  it("is best-effort: never throws when the insert fails", async () => {
    valuesMock.mockRejectedValueOnce(new Error("db down"));

    await expect(
      recordAudit(db, {
        actorId: "user_1",
        action: AuditAction.GroupDeleted,
        targetType: "group",
        targetId: "group_1",
      }),
    ).resolves.toBeUndefined();
  });
});
