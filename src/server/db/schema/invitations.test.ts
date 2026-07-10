import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { groupInvitations } from "./groups";

/**
 * Issue #181 — `group_invitations` is the new pending-invite brick on top of
 * `group_members`. Assert its shape at the schema source of truth: columns,
 * the status enum, the single-use token, the partial "one pending invite per
 * email" index, FK cascade/set-null behaviour, and the contact CHECK.
 */
describe("group_invitations table (issue #181)", () => {
  const { columns, indexes, checks, foreignKeys } =
    getTableConfig(groupInvitations);
  const col = (name: string) => columns.find((c) => c.name === name);
  const fkOn = (name: string) =>
    foreignKeys.find((f) => f.reference().columns.some((c) => c.name === name));

  it("has the expected columns", () => {
    for (const name of [
      "id",
      "groupId",
      "invitedById",
      "userId",
      "email",
      "handle",
      "role",
      "token",
      "status",
      "expiresAt",
      "createdAt",
      "updatedAt",
    ]) {
      expect(col(name), `expected a ${name} column`).toBeDefined();
    }
  });

  it("models status as an enum with the full lifecycle", () => {
    expect(col("status")?.enumValues).toEqual([
      "pending",
      "accepted",
      "revoked",
      "expired",
    ]);
    expect(col("status")?.notNull).toBe(true);
  });

  it("requires a unique single-use token", () => {
    expect(col("token")?.notNull).toBe(true);
    expect(col("token")?.isUnique, "expected token to be unique").toBe(true);
  });

  it("prevents duplicate pending invites per (group, email) via a partial unique index", () => {
    const idx = indexes.find(
      (i) => i.config.name === "group_invitations_pending_email_uq",
    );
    expect(idx, "expected group_invitations_pending_email_uq").toBeDefined();
    expect(idx?.config.unique).toBe(true);
    expect(idx?.config.where, "expected a partial WHERE").toBeDefined();
    expect(
      idx?.config.columns.map((c) => (c as { name: string }).name),
    ).toEqual(["groupId", "email"]);
  });

  it("indexes the group foreign key", () => {
    expect(
      indexes.some((i) => i.config.name === "group_invitations_group_idx"),
    ).toBe(true);
  });

  it("cascades from the group but nulls out the user references", () => {
    expect(fkOn("groupId")?.onDelete).toBe("cascade");
    expect(fkOn("invitedById")?.onDelete).toBe("set null");
    expect(fkOn("userId")?.onDelete).toBe("set null");
  });

  it("requires an email or handle via a CHECK", () => {
    expect(
      checks.some((c) => c.name === "group_invitations_contact_check"),
    ).toBe(true);
  });
});
