import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock, getGroupSeatLimitMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  getGroupSeatLimitMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: { transaction: transactionMock },
}));

vi.mock("~/server/billing/entitlements", () => ({
  getGroupSeatLimit: getGroupSeatLimitMock,
}));

import type { MemberRole, User } from "~/server/db/schema";
import {
  addMember,
  deleteGroup,
  transferOwnership,
  updateMemberRole,
} from "./mutations";

type Membership = {
  id: string;
  role: MemberRole;
  userId: string;
  groupId: string;
} | null;

const group = { id: "group_1", slug: "family", name: "Family" };

/**
 * Fake Drizzle transaction. `memberships` is consumed in call order for the
 * plain `membershipFor` lookups (actor first, then any target/existing check);
 * `memberWithUser` answers the hydrated lookup (the one passing `with`).
 */
function fakeTx(opts: {
  memberships?: Membership[];
  targetUser?: unknown;
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
    chain,
    query: {
      groups: {
        findFirst: vi.fn(async () => group),
      },
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
      users: {
        findFirst: vi.fn(async () => opts.targetUser ?? null),
      },
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
  // Default: unlimited seats, so existing add/role tests are unaffected by the
  // #325 seat check. Seat-specific tests override this.
  getGroupSeatLimitMock.mockResolvedValue(null);
});

const owner = { id: "owner_1" } as unknown as User;
const admin = { id: "admin_1" } as unknown as User;
const targetUser = { id: "target_1", name: "Aunt Mary", handle: "aunt-mary" };

describe("addMember role authorization (sp01)", () => {
  it("lets an OWNER add a member directly as admin", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "gm_actor", role: "owner", userId: owner.id, groupId: group.id },
        null,
      ],
      targetUser,
      memberWithUser: {
        id: "gm_new",
        role: "admin",
        user: {
          id: "target_1",
          name: "Aunt Mary",
          handle: "aunt-mary",
          avatarUrl: null,
        },
      },
    });
    runWith(tx);

    await expect(
      addMember(group.slug, owner, "aunt-mary", "admin"),
    ).resolves.toMatchObject({ role: "admin" });
    expect(tx.insert).toHaveBeenCalled();
  });

  it("forbids an ADMIN from minting a fellow admin", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "gm_actor", role: "admin", userId: admin.id, groupId: group.id },
      ],
      targetUser,
    });
    runWith(tx);

    await expect(
      addMember(group.slug, admin, "aunt-mary", "admin"),
    ).rejects.toThrow("FORBIDDEN");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("still lets an ADMIN add a regular member", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "gm_actor", role: "admin", userId: admin.id, groupId: group.id },
        null,
      ],
      targetUser,
      memberWithUser: {
        id: "gm_new",
        role: "member",
        user: {
          id: "target_1",
          name: "Aunt Mary",
          handle: "aunt-mary",
          avatarUrl: null,
        },
      },
    });
    runWith(tx);

    await expect(
      addMember(group.slug, admin, "aunt-mary", "member"),
    ).resolves.toMatchObject({ role: "member" });
    expect(tx.insert).toHaveBeenCalled();
  });
});

describe("addMember seat enforcement (#325)", () => {
  it("blocks adding a member beyond the seat limit with SEAT_LIMIT_REACHED", async () => {
    getGroupSeatLimitMock.mockResolvedValue(2);
    const tx = fakeTx({
      memberships: [
        { id: "gm_actor", role: "owner", userId: owner.id, groupId: group.id },
        null,
      ],
      targetUser,
      groupMemberRoles: [{ role: "owner" }, { role: "member" }],
    });
    runWith(tx);

    await expect(
      addMember(group.slug, owner, "aunt-mary", "member"),
    ).rejects.toThrow("SEAT_LIMIT_REACHED");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("allows an add that stays within the seat limit", async () => {
    getGroupSeatLimitMock.mockResolvedValue(5);
    const tx = fakeTx({
      memberships: [
        { id: "gm_actor", role: "owner", userId: owner.id, groupId: group.id },
        null,
      ],
      targetUser,
      groupMemberRoles: [{ role: "owner" }, { role: "member" }],
      memberWithUser: {
        id: "gm_new",
        role: "member",
        user: {
          id: "target_1",
          name: "Aunt Mary",
          handle: "aunt-mary",
          avatarUrl: null,
        },
      },
    });
    runWith(tx);

    await expect(
      addMember(group.slug, owner, "aunt-mary", "member"),
    ).resolves.toMatchObject({ role: "member" });
    expect(tx.insert).toHaveBeenCalled();
  });

  it("never counts a kid against seats, even at the limit", async () => {
    getGroupSeatLimitMock.mockResolvedValue(2);
    const tx = fakeTx({
      memberships: [
        { id: "gm_actor", role: "owner", userId: owner.id, groupId: group.id },
        null,
      ],
      targetUser,
      groupMemberRoles: [{ role: "owner" }, { role: "member" }],
      memberWithUser: {
        id: "gm_kid",
        role: "kid",
        user: {
          id: "target_1",
          name: "Aunt Mary",
          handle: "aunt-mary",
          avatarUrl: null,
        },
      },
    });
    runWith(tx);

    await expect(
      addMember(group.slug, owner, "aunt-mary", "kid"),
    ).resolves.toMatchObject({ role: "kid" });
    expect(tx.insert).toHaveBeenCalled();
    // Kids ride free, so we don't even resolve the seat limit for them.
    expect(getGroupSeatLimitMock).not.toHaveBeenCalled();
  });
});

describe("updateMemberRole authorization (sp01)", () => {
  it("lets an OWNER promote a member to admin", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "gm_actor", role: "owner", userId: owner.id, groupId: group.id },
        {
          id: "gm_target",
          role: "member",
          userId: "target_1",
          groupId: group.id,
        },
      ],
      memberWithUser: {
        id: "gm_target",
        role: "admin",
        user: {
          id: "target_1",
          name: "Aunt Mary",
          handle: "aunt-mary",
          avatarUrl: null,
        },
      },
    });
    runWith(tx);

    await expect(
      updateMemberRole(group.slug, owner, "target_1", "admin"),
    ).resolves.toMatchObject({ role: "admin" });
  });

  it("forbids an ADMIN from promoting anyone to admin", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "gm_actor", role: "admin", userId: admin.id, groupId: group.id },
      ],
    });
    runWith(tx);

    await expect(
      updateMemberRole(group.slug, admin, "target_1", "admin"),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("deleteGroup downgrades group recipes (sp03)", () => {
  it("downgrades group-visibility recipes to private instead of orphaning them", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "gm_actor", role: "owner", userId: owner.id, groupId: group.id },
      ],
    });
    runWith(tx);

    await expect(deleteGroup(group.slug, owner)).resolves.toMatchObject({
      slug: "family",
    });

    // The group's recipes are downgraded to private (and detached) in the same
    // transaction, before the group row is removed.
    expect(tx.update).toHaveBeenCalled();
    expect(tx.chain.set).toHaveBeenCalledWith({
      visibility: "private",
      groupId: null,
    });
    expect(tx.delete).toHaveBeenCalled();
  });
});

/**
 * Cross-tenant / negative-authorization regression guards (issue #220). Each
 * case asserts a privilege boundary and fails if the corresponding guard is
 * removed — the class of access-control regression that otherwise slips through
 * CI. Complements the positive role happy-paths above.
 */
describe("group authz regression guards (i220)", () => {
  it("forbids an OWNER from promoting anyone straight to owner (use transfer)", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "gm_actor", role: "owner", userId: owner.id, groupId: group.id },
        {
          id: "gm_target",
          role: "member",
          userId: "target_1",
          groupId: group.id,
        },
      ],
    });
    runWith(tx);

    await expect(
      updateMemberRole(group.slug, owner, "target_1", "owner"),
    ).rejects.toThrow("FORBIDDEN");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("forbids an ADMIN from demoting/changing another member's role", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "gm_actor", role: "admin", userId: admin.id, groupId: group.id },
      ],
    });
    runWith(tx);

    await expect(
      updateMemberRole(group.slug, admin, "target_1", "member"),
    ).rejects.toThrow("FORBIDDEN");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("forbids a NON-OWNER (admin) from transferring ownership", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "gm_actor", role: "admin", userId: admin.id, groupId: group.id },
      ],
    });
    runWith(tx);

    await expect(
      transferOwnership(group.slug, admin, "target_1"),
    ).rejects.toThrow("FORBIDDEN");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("forbids a NON-MEMBER (stranger) from managing a group they don't belong to", async () => {
    // membershipFor(actor) resolves to null → requireOwner throws FORBIDDEN.
    const tx = fakeTx({ memberships: [null] });
    runWith(tx);

    const stranger = { id: "stranger_1" } as unknown as User;
    await expect(
      updateMemberRole(group.slug, stranger, "target_1", "admin"),
    ).rejects.toThrow("FORBIDDEN");
    expect(tx.update).not.toHaveBeenCalled();
  });
});
