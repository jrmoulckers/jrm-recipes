import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock, getGroupSeatLimitMock, recordAuditMock } = vi.hoisted(
  () => ({
    transactionMock: vi.fn(),
    getGroupSeatLimitMock: vi.fn(),
    recordAuditMock: vi.fn(async () => undefined),
  }),
);

vi.mock("~/server/db", () => ({
  db: { transaction: transactionMock },
}));

vi.mock("~/server/billing/entitlements", () => ({
  getGroupSeatLimit: getGroupSeatLimitMock,
}));

vi.mock("~/server/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/audit")>();
  return { ...actual, recordAudit: recordAuditMock };
});

import type { MemberRole, User } from "~/server/db/schema";
import { AuditAction } from "~/server/audit";
import { deleteGroup, transferOwnership, updateMemberRole } from "./mutations";

type Membership = {
  id: string;
  role: MemberRole;
  userId: string;
  groupId: string;
} | null;

const group = { id: "group_1", slug: "family", name: "Family" };

function fakeTx(opts: {
  memberships?: Membership[];
  memberWithUser?: unknown;
  groupMemberRoles?: { role: MemberRole }[];
}) {
  const chain = {
    set: vi.fn(() => chain),
    values: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(async () => [{ id: "row_1", slug: "family" }]),
  };
  const memberships = [...(opts.memberships ?? [])];
  return {
    query: {
      groups: { findFirst: vi.fn(async () => group) },
      groupMembers: {
        findFirst: vi.fn(async (args?: { with?: unknown }) => {
          if (args && "with" in args && args.with) {
            return (
              opts.memberWithUser ?? {
                id: "row_1",
                role: "member",
                user: { id: "u", name: "N", handle: "h", avatarUrl: null },
              }
            );
          }
          return memberships.length ? memberships.shift() : null;
        }),
        findMany: vi.fn(async () => opts.groupMemberRoles ?? []),
      },
      users: { findFirst: vi.fn(async () => null) },
    },
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
  };
}

function runWith(tx: unknown) {
  transactionMock.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
}

beforeEach(() => {
  vi.clearAllMocks();
  getGroupSeatLimitMock.mockResolvedValue(null);
});

const owner = { id: "owner_1" } as unknown as User;

describe("group mutation audit logging (#219)", () => {
  it("records an audit entry for a member role change", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "gm_owner", role: "owner", userId: owner.id, groupId: group.id },
        {
          id: "gm_target",
          role: "member",
          userId: "target_1",
          groupId: group.id,
        },
      ],
    });
    runWith(tx);

    await updateMemberRole(group.slug, owner, "target_1", "admin");

    expect(recordAuditMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: owner.id,
        action: AuditAction.GroupMemberRoleUpdated,
        targetType: "group",
        targetId: group.id,
        metadata: expect.objectContaining({
          from: "member",
          to: "admin",
        }) as Record<string, unknown>,
      }),
    );
  });

  it("records an audit entry when a group is deleted", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "gm_owner", role: "owner", userId: owner.id, groupId: group.id },
      ],
    });
    runWith(tx);

    await deleteGroup(group.slug, owner);

    expect(recordAuditMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: owner.id,
        action: AuditAction.GroupDeleted,
        targetType: "group",
        targetId: group.id,
      }),
    );
  });

  it("records an audit entry for ownership transfer", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "gm_owner", role: "owner", userId: owner.id, groupId: group.id },
        { id: "gm_target", role: "admin", userId: "new_1", groupId: group.id },
        { id: "gm_owner2", role: "owner", userId: owner.id, groupId: group.id },
      ],
    });
    runWith(tx);

    await transferOwnership(group.slug, owner, "new_1");

    expect(recordAuditMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: AuditAction.GroupOwnershipTransferred,
        targetId: group.id,
      }),
    );
  });
});
