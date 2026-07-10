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

import {
  groupInvitations,
  groupMembers,
  type MemberRole,
  type User,
} from "~/server/db/schema";
import {
  acceptInvitation,
  createInvitation,
  revokeInvitation,
} from "./mutations";

type Membership = {
  id: string;
  role: MemberRole;
  userId: string;
  groupId: string;
} | null;

const group = { id: "group_1", slug: "family", name: "Family" };
const owner = { id: "owner_1" } as unknown as User;
const admin = { id: "admin_1" } as unknown as User;
const joiner = { id: "joiner_1" } as unknown as User;

const HOUR = 60 * 60 * 1000;
const future = () => new Date(Date.now() + 24 * HOUR);
const past = () => new Date(Date.now() - HOUR);

function ownerMember(): Membership {
  return {
    id: "m_owner",
    role: "owner",
    userId: "owner_1",
    groupId: "group_1",
  };
}
function adminMember(): Membership {
  return {
    id: "m_admin",
    role: "admin",
    userId: "admin_1",
    groupId: "group_1",
  };
}

function fakeTx(opts: {
  memberships?: Membership[];
  targetUser?: unknown;
  invitation?: unknown;
  returning?: unknown[];
  groupMemberRoles?: { role: MemberRole }[];
}) {
  const chain = {
    set: vi.fn((_arg?: unknown) => chain),
    values: vi.fn((_arg?: unknown) => chain),
    where: vi.fn((_arg?: unknown) => chain),
    returning: vi.fn(
      async () =>
        opts.returning ?? [
          {
            id: "inv_1",
            token: "tok_1",
            status: "pending",
            expiresAt: future(),
          },
        ],
    ),
  };
  const memberships = [...(opts.memberships ?? [])];
  return {
    chain,
    query: {
      groups: { findFirst: vi.fn(async () => group) },
      groupMembers: {
        findFirst: vi.fn(async () =>
          memberships.length ? memberships.shift() : null,
        ),
        findMany: vi.fn(async () => opts.groupMemberRoles ?? []),
      },
      users: { findFirst: vi.fn(async () => opts.targetUser ?? null) },
      groupInvitations: {
        findFirst: vi.fn(async () => opts.invitation ?? null),
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
  // Default: unlimited seats so existing invite tests are unaffected by the
  // #325 seat check. Seat-specific tests override this.
  getGroupSeatLimitMock.mockResolvedValue(null);
});

describe("createInvitation (issue #181)", () => {
  it("owner creates a pending invitation with a token and expiry", async () => {
    const tx = fakeTx({ memberships: [ownerMember()] });
    runWith(tx);

    const result = await createInvitation("family", owner, {
      email: "aunt@example.com",
      role: "member",
      expiresInDays: 14,
    });

    expect(result.token).toBeTruthy();
    expect(tx.insert).toHaveBeenCalledWith(groupInvitations);
    const values = tx.chain.values.mock.calls[0]![0] as {
      email: string | null;
      role: MemberRole;
      status: string;
      token: string;
      expiresAt: Date;
    };
    expect(values.email).toBe("aunt@example.com");
    expect(values.role).toBe("member");
    expect(values.status).toBe("pending");
    expect(typeof values.token).toBe("string");
    expect(values.expiresAt).toBeInstanceOf(Date);
  });

  it("rejects a non-member actor with FORBIDDEN", async () => {
    runWith(fakeTx({ memberships: [] }));
    await expect(
      createInvitation("family", owner, { email: "x@example.com" }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("stops an admin from inviting a fellow admin", async () => {
    const tx = fakeTx({ memberships: [adminMember()] });
    runWith(tx);
    await expect(
      createInvitation("family", admin, {
        email: "x@example.com",
        role: "admin",
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("refuses to invite someone who is already a member", async () => {
    const tx = fakeTx({
      memberships: [
        ownerMember(),
        { id: "m_t", role: "member", userId: "t1", groupId: "group_1" },
      ],
      targetUser: { id: "t1" },
    });
    runWith(tx);
    await expect(
      createInvitation("family", owner, { email: "member@example.com" }),
    ).rejects.toThrow("ALREADY_MEMBER");
  });

  it("refuses a duplicate pending invite", async () => {
    const tx = fakeTx({
      memberships: [ownerMember()],
      invitation: { id: "dup" },
    });
    runWith(tx);
    await expect(
      createInvitation("family", owner, { email: "dup@example.com" }),
    ).rejects.toThrow("ALREADY_INVITED");
  });
});

describe("acceptInvitation (issue #181)", () => {
  it("creates the membership with the invited role and marks accepted", async () => {
    const tx = fakeTx({
      memberships: [null],
      invitation: {
        id: "inv_1",
        groupId: "group_1",
        status: "pending",
        role: "member",
        expiresAt: future(),
      },
    });
    runWith(tx);

    const result = await acceptInvitation("tok_1", joiner);

    expect(result).toEqual({
      groupId: "group_1",
      role: "member",
      alreadyMember: false,
    });
    expect(tx.insert).toHaveBeenCalledWith(groupMembers);
    const member = tx.chain.values.mock.calls[0]![0] as {
      userId: string;
      role: MemberRole;
    };
    expect(member).toEqual({
      groupId: "group_1",
      userId: "joiner_1",
      role: "member",
    });
    expect(tx.chain.set).toHaveBeenCalledWith({
      status: "accepted",
      userId: "joiner_1",
    });
  });

  it("lazily expires and rejects an overdue invite", async () => {
    const tx = fakeTx({
      invitation: {
        id: "inv_1",
        groupId: "group_1",
        status: "pending",
        role: "member",
        expiresAt: past(),
      },
    });
    runWith(tx);

    await expect(acceptInvitation("tok_1", joiner)).rejects.toThrow("EXPIRED");
    expect(tx.chain.set).toHaveBeenCalledWith({ status: "expired" });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects a revoked invite", async () => {
    const tx = fakeTx({
      invitation: { id: "inv_1", groupId: "group_1", status: "revoked" },
    });
    runWith(tx);
    await expect(acceptInvitation("tok_1", joiner)).rejects.toThrow("REVOKED");
  });

  it("is idempotent when the user is already a member (no duplicate insert)", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "m", role: "member", userId: "joiner_1", groupId: "group_1" },
      ],
      invitation: {
        id: "inv_1",
        groupId: "group_1",
        status: "pending",
        role: "member",
        expiresAt: future(),
      },
    });
    runWith(tx);

    const result = await acceptInvitation("tok_1", joiner);

    expect(result.alreadyMember).toBe(true);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.chain.set).toHaveBeenCalledWith({
      status: "accepted",
      userId: "joiner_1",
    });
  });

  it("won't reuse a consumed (accepted) invite for a non-member", async () => {
    const tx = fakeTx({
      memberships: [null],
      invitation: {
        id: "inv_1",
        groupId: "group_1",
        status: "accepted",
        role: "member",
        expiresAt: future(),
      },
    });
    runWith(tx);
    await expect(acceptInvitation("tok_1", joiner)).rejects.toThrow(
      "ALREADY_ACCEPTED",
    );
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

describe("revokeInvitation (issue #181)", () => {
  it("manager revokes a pending invite", async () => {
    const tx = fakeTx({
      memberships: [adminMember()],
      invitation: { id: "inv_1", groupId: "group_1", status: "pending" },
    });
    runWith(tx);

    const result = await revokeInvitation("family", admin, "inv_1");

    expect(result).toEqual({ id: "inv_1", status: "revoked" });
    expect(tx.chain.set).toHaveBeenCalledWith({ status: "revoked" });
  });

  it("is idempotent for an already-revoked invite", async () => {
    const tx = fakeTx({
      memberships: [ownerMember()],
      invitation: { id: "inv_1", groupId: "group_1", status: "revoked" },
    });
    runWith(tx);

    const result = await revokeInvitation("family", owner, "inv_1");

    expect(result).toEqual({ id: "inv_1", status: "revoked" });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("won't revoke an accepted invite", async () => {
    const tx = fakeTx({
      memberships: [ownerMember()],
      invitation: { id: "inv_1", groupId: "group_1", status: "accepted" },
    });
    runWith(tx);
    await expect(revokeInvitation("family", owner, "inv_1")).rejects.toThrow(
      "NOT_PENDING",
    );
  });

  it("rejects a non-manager", async () => {
    runWith(fakeTx({ memberships: [] }));
    await expect(revokeInvitation("family", admin, "inv_1")).rejects.toThrow(
      "FORBIDDEN",
    );
  });
});

describe("acceptInvitation seat enforcement (#325)", () => {
  const pendingInvite = (role: MemberRole) => ({
    id: "inv_1",
    groupId: "group_1",
    status: "pending" as const,
    role,
    expiresAt: future(),
  });

  it("rejects joining beyond the seat limit and seats nobody", async () => {
    getGroupSeatLimitMock.mockResolvedValue(2);
    const tx = fakeTx({
      memberships: [null],
      invitation: pendingInvite("member"),
      groupMemberRoles: [{ role: "owner" }, { role: "member" }],
    });
    runWith(tx);

    await expect(acceptInvitation("tok_1", joiner)).rejects.toThrow(
      "SEAT_LIMIT_REACHED",
    );
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("lets a member join when a seat is available", async () => {
    getGroupSeatLimitMock.mockResolvedValue(5);
    const tx = fakeTx({
      memberships: [null],
      invitation: pendingInvite("member"),
      groupMemberRoles: [{ role: "owner" }, { role: "member" }],
    });
    runWith(tx);

    await expect(acceptInvitation("tok_1", joiner)).resolves.toMatchObject({
      role: "member",
      alreadyMember: false,
    });
    expect(tx.insert).toHaveBeenCalledWith(groupMembers);
  });

  it("never counts a kid invite against seats, even at the limit", async () => {
    getGroupSeatLimitMock.mockResolvedValue(2);
    const tx = fakeTx({
      memberships: [null],
      invitation: pendingInvite("kid"),
      groupMemberRoles: [{ role: "owner" }, { role: "member" }],
    });
    runWith(tx);

    await expect(acceptInvitation("tok_1", joiner)).resolves.toMatchObject({
      role: "kid",
      alreadyMember: false,
    });
    expect(tx.insert).toHaveBeenCalledWith(groupMembers);
    expect(getGroupSeatLimitMock).not.toHaveBeenCalled();
  });
});
