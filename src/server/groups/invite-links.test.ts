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
  groupInviteLinks,
  groupMembers,
  type MemberRole,
  type User,
} from "~/server/db/schema";
import { acceptInviteLink, createInviteLink, revokeInviteLink } from "./mutations";

type Membership = {
  id: string;
  role: MemberRole;
  userId: string;
  groupId: string;
} | null;

const group = { id: "group_1", slug: "family", name: "Family" };
const owner = { id: "owner_1" } as unknown as User;
const stranger = { id: "stranger_1" } as unknown as User;
const joiner = { id: "joiner_1" } as unknown as User;

const HOUR = 60 * 60 * 1000;
const future = () => new Date(Date.now() + 24 * HOUR);
const past = () => new Date(Date.now() - HOUR);

function ownerMember(): Membership {
  return { id: "m_owner", role: "owner", userId: "owner_1", groupId: "group_1" };
}

function fakeTx(opts: {
  memberships?: Membership[];
  link?: unknown;
  returning?: unknown[];
  groupMemberRoles?: { role: MemberRole }[];
}) {
  const chain = {
    set: vi.fn((_arg?: unknown) => chain),
    values: vi.fn((_arg?: unknown) => chain),
    where: vi.fn((_arg?: unknown) => chain),
    returning: vi.fn(async () =>
      opts.returning ?? [
        {
          id: "link_1",
          token: "tok_link",
          role: "member",
          expiresAt: null,
          maxUses: null,
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
      groupInviteLinks: {
        findFirst: vi.fn(async () => opts.link ?? null),
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
  // Default: unlimited seats so existing invite-link tests are unaffected by the
  // #325 seat check. Seat-specific tests override this.
  getGroupSeatLimitMock.mockResolvedValue(null);
});

describe("createInviteLink (issue #343)", () => {
  it("a manager mints a link with a token and no expiry by default", async () => {
    const tx = fakeTx({ memberships: [ownerMember()] });
    runWith(tx);

    const result = await createInviteLink("family", owner, { role: "member" });

    expect(result.token).toBe("tok_link");
    expect(result.slug).toBe("family");
    expect(tx.insert).toHaveBeenCalledWith(groupInviteLinks);
    const values = tx.chain.values.mock.calls[0]![0] as {
      groupId: string;
      role: MemberRole;
      token: string;
      expiresAt: Date | null;
      maxUses: number | null;
    };
    expect(values.groupId).toBe("group_1");
    expect(values.role).toBe("member");
    expect(typeof values.token).toBe("string");
    expect(values.expiresAt).toBeNull();
    expect(values.maxUses).toBeNull();
  });

  it("maps expiresInDays to a future expiry and passes maxUses through", async () => {
    const tx = fakeTx({ memberships: [ownerMember()] });
    runWith(tx);

    await createInviteLink("family", owner, {
      role: "kid",
      expiresInDays: 7,
      maxUses: 5,
    });

    const values = tx.chain.values.mock.calls[0]![0] as {
      role: MemberRole;
      expiresAt: Date | null;
      maxUses: number | null;
    };
    expect(values.role).toBe("kid");
    expect(values.expiresAt).toBeInstanceOf(Date);
    expect(values.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(values.maxUses).toBe(5);
  });

  it("rejects a non-manager with FORBIDDEN", async () => {
    const tx = fakeTx({ memberships: [] });
    runWith(tx);
    await expect(
      createInviteLink("family", stranger, { role: "member" }),
    ).rejects.toThrow("FORBIDDEN");
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

describe("acceptInviteLink (issue #343)", () => {
  it("creates the membership at the link's role and bumps useCount", async () => {
    const tx = fakeTx({
      memberships: [null],
      link: {
        id: "link_1",
        groupId: "group_1",
        role: "member",
        token: "tok_link",
        expiresAt: null,
        maxUses: null,
        useCount: 0,
        revokedAt: null,
      },
    });
    runWith(tx);

    const result = await acceptInviteLink("tok_link", joiner);

    expect(result).toEqual({
      groupId: "group_1",
      slug: "family",
      role: "member",
      alreadyMember: false,
    });
    expect(tx.insert).toHaveBeenCalledWith(groupMembers);
    const member = tx.chain.values.mock.calls[0]![0] as {
      groupId: string;
      userId: string;
      role: MemberRole;
    };
    expect(member).toEqual({
      groupId: "group_1",
      userId: "joiner_1",
      role: "member",
    });
    // useCount incremented via an update to the link.
    expect(tx.update).toHaveBeenCalledWith(groupInviteLinks);
  });

  it("is idempotent for an existing member (no insert, no use spent)", async () => {
    const tx = fakeTx({
      memberships: [
        { id: "m", role: "member", userId: "joiner_1", groupId: "group_1" },
      ],
      link: {
        id: "link_1",
        groupId: "group_1",
        role: "member",
        token: "tok_link",
        expiresAt: null,
        maxUses: 1,
        useCount: 1,
        revokedAt: null,
      },
    });
    runWith(tx);

    const result = await acceptInviteLink("tok_link", joiner);

    expect(result.alreadyMember).toBe(true);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects a revoked link", async () => {
    const tx = fakeTx({
      link: {
        id: "link_1",
        groupId: "group_1",
        role: "member",
        token: "tok_link",
        expiresAt: null,
        maxUses: null,
        useCount: 0,
        revokedAt: new Date(),
      },
    });
    runWith(tx);
    await expect(acceptInviteLink("tok_link", joiner)).rejects.toThrow(
      "REVOKED",
    );
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects an expired link", async () => {
    const tx = fakeTx({
      link: {
        id: "link_1",
        groupId: "group_1",
        role: "member",
        token: "tok_link",
        expiresAt: past(),
        maxUses: null,
        useCount: 0,
        revokedAt: null,
      },
    });
    runWith(tx);
    await expect(acceptInviteLink("tok_link", joiner)).rejects.toThrow(
      "EXPIRED",
    );
  });

  it("rejects a new join once the cap is reached", async () => {
    const tx = fakeTx({
      memberships: [null],
      link: {
        id: "link_1",
        groupId: "group_1",
        role: "member",
        token: "tok_link",
        expiresAt: future(),
        maxUses: 2,
        useCount: 2,
        revokedAt: null,
      },
      // The conditional bump's `useCount < maxUses` guard matches no rows.
      returning: [],
    });
    runWith(tx);
    await expect(acceptInviteLink("tok_link", joiner)).rejects.toThrow(
      "EXHAUSTED",
    );
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("never seats more members than maxUses when two redemptions race", async () => {
    const link = {
      id: "link_1",
      groupId: "group_1",
      role: "member" as MemberRole,
      token: "tok_link",
      expiresAt: null,
      maxUses: 1,
      useCount: 0,
      revokedAt: null,
    };

    // First redeemer wins the single use: the conditional bump matches the row.
    const first = fakeTx({
      memberships: [null],
      link,
      returning: [{ id: "link_1" }],
    });
    runWith(first);
    const a = await acceptInviteLink("tok_link", joiner);
    expect(a.alreadyMember).toBe(false);
    expect(first.insert).toHaveBeenCalledWith(groupMembers);
    // The use is claimed before the membership is seated, so an exhausted link
    // can never insert a member.
    expect(first.update.mock.invocationCallOrder[0]!).toBeLessThan(
      first.insert.mock.invocationCallOrder[0]!,
    );

    // A different user redeeming concurrently still reads useCount 0 (READ
    // COMMITTED stale read), but the atomic bump now fails `useCount < maxUses`
    // and returns no rows, so the loser is rejected and seats nobody — useCount
    // never exceeds maxUses.
    const second = fakeTx({
      memberships: [null],
      link,
      returning: [],
    });
    runWith(second);
    await expect(acceptInviteLink("tok_link", stranger)).rejects.toThrow(
      "EXHAUSTED",
    );
    expect(second.insert).not.toHaveBeenCalled();
  });

  it("rejects an unknown token", async () => {
    const tx = fakeTx({ link: null });
    runWith(tx);
    await expect(acceptInviteLink("nope", joiner)).rejects.toThrow("NOT_FOUND");
  });
});

describe("revokeInviteLink (issue #366)", () => {
  const activeLink = {
    id: "link_1",
    groupId: "group_1",
    token: "tok_link",
    revokedAt: null,
  };

  it("a manager revokes an active link by setting revokedAt", async () => {
    const tx = fakeTx({ memberships: [ownerMember()], link: activeLink });
    runWith(tx);

    const result = await revokeInviteLink("family", owner, "tok_link");

    expect(result).toEqual({ id: "link_1", slug: "family" });
    expect(tx.update).toHaveBeenCalledWith(groupInviteLinks);
    const patch = tx.chain.set.mock.calls[0]![0] as { revokedAt: Date };
    expect(patch.revokedAt).toBeInstanceOf(Date);
  });

  it("is idempotent for an already-revoked link (no second write)", async () => {
    const tx = fakeTx({
      memberships: [ownerMember()],
      link: { ...activeLink, revokedAt: past() },
    });
    runWith(tx);

    const result = await revokeInviteLink("family", owner, "tok_link");

    expect(result).toEqual({ id: "link_1", slug: "family" });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects a non-manager with FORBIDDEN", async () => {
    const tx = fakeTx({ memberships: [], link: activeLink });
    runWith(tx);
    await expect(
      revokeInviteLink("family", stranger, "tok_link"),
    ).rejects.toThrow("FORBIDDEN");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown token with NOT_FOUND", async () => {
    const tx = fakeTx({ memberships: [ownerMember()], link: null });
    runWith(tx);
    await expect(revokeInviteLink("family", owner, "nope")).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(tx.update).not.toHaveBeenCalled();
  });
});

describe("acceptInviteLink seat enforcement (#325)", () => {
  const openLink = (role: MemberRole) => ({
    id: "link_1",
    groupId: "group_1",
    role,
    token: "tok_link",
    expiresAt: null,
    maxUses: null,
    useCount: 0,
    revokedAt: null,
  });

  it("rejects joining a full group and rolls the use-claim back", async () => {
    getGroupSeatLimitMock.mockResolvedValue(2);
    const tx = fakeTx({
      memberships: [null],
      link: openLink("member"),
      groupMemberRoles: [{ role: "owner" }, { role: "member" }],
    });
    runWith(tx);

    await expect(acceptInviteLink("tok_link", joiner)).rejects.toThrow(
      "SEAT_LIMIT_REACHED",
    );
    // The seat check runs after the atomic use-claim but before seating, and it
    // throws inside the tx — so no member is inserted and the useCount bump is
    // rolled back with the transaction.
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("lets a member join via link when a seat is available", async () => {
    getGroupSeatLimitMock.mockResolvedValue(5);
    const tx = fakeTx({
      memberships: [null],
      link: openLink("member"),
      groupMemberRoles: [{ role: "owner" }, { role: "member" }],
    });
    runWith(tx);

    await expect(acceptInviteLink("tok_link", joiner)).resolves.toMatchObject({
      role: "member",
      alreadyMember: false,
    });
    expect(tx.insert).toHaveBeenCalledWith(groupMembers);
  });

  it("never counts a kid joining via link against seats", async () => {
    getGroupSeatLimitMock.mockResolvedValue(2);
    const tx = fakeTx({
      memberships: [null],
      link: openLink("kid"),
      groupMemberRoles: [{ role: "owner" }, { role: "member" }],
    });
    runWith(tx);

    await expect(acceptInviteLink("tok_link", joiner)).resolves.toMatchObject({
      role: "kid",
      alreadyMember: false,
    });
    expect(tx.insert).toHaveBeenCalledWith(groupMembers);
    expect(getGroupSeatLimitMock).not.toHaveBeenCalled();
  });
});
