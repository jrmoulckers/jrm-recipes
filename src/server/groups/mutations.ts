import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import { slugify } from "~/lib/utils";
import { db } from "~/server/db";
import { DomainError } from "~/server/errors";
import {
  groupInvitations,
  groupInviteLinks,
  groupMembers,
  groups,
  recipes,
  users,
  type MemberRole,
  type User,
} from "~/server/db/schema";
import {
  type CreateInviteLinkInput,
  createInviteLinkInput,
  type GroupInput,
  type InviteInput,
  inviteInput,
} from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const MANAGER_ROLES = new Set<MemberRole>(["owner", "admin"]);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Opaque, URL-safe bearer token for an invitation's accept link (issue #181). */
function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Strip a leading `@` and l-case a handle so it matches the stored form. */
function normalizeHandle(handle: string | undefined): string | null {
  if (!handle) return null;
  const normalized = handle.replace(/^@/, "").toLowerCase();
  return normalized.length ? normalized : null;
}

function groupSlug(name: string): string {
  const base = slugify(name).slice(0, 72);
  return base || "group";
}

async function uniqueSlug(tx: Tx, base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    const existing = await tx.query.groups.findFirst({
      where: eq(groups.slug, candidate),
      columns: { id: true },
    });
    if (!existing) return candidate;
    const suffix = `-${(i + 2).toString(36)}`;
    candidate = `${base.slice(0, 80 - suffix.length)}${suffix}`;
  }
  return `${base.slice(0, 68)}-${Date.now().toString(36)}`;
}

async function findGroup(tx: Tx, slugOrId: string) {
  return (
    (await tx.query.groups.findFirst({
      where: or(eq(groups.id, slugOrId), eq(groups.slug, slugOrId)),
    })) ?? null
  );
}

async function membershipFor(tx: Tx, groupId: string, userId: string) {
  return (
    (await tx.query.groupMembers.findFirst({
      where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    })) ?? null
  );
}

async function requireActorRole(tx: Tx, groupId: string, actor: User) {
  const membership = await membershipFor(tx, groupId, actor.id);
  if (!membership) throw new DomainError("FORBIDDEN");
  return membership.role;
}

async function requireManager(tx: Tx, groupId: string, actor: User) {
  const role = await requireActorRole(tx, groupId, actor);
  if (!MANAGER_ROLES.has(role)) throw new DomainError("FORBIDDEN");
  return role;
}

async function requireOwner(tx: Tx, groupId: string, actor: User) {
  const role = await requireActorRole(tx, groupId, actor);
  if (role !== "owner") throw new DomainError("FORBIDDEN");
  return role;
}

async function findUserByIdentifier(tx: Tx, identifier: string) {
  const trimmed = identifier.trim();
  const normalizedHandle = trimmed.replace(/^@/, "").toLowerCase();
  const normalizedEmail = trimmed.toLowerCase();

  return (
    (await tx.query.users.findFirst({
      where: or(
        sql`lower(${users.handle}) = ${normalizedHandle}`,
        sql`lower(${users.email}) = ${normalizedEmail}`,
      ),
    })) ?? null
  );
}

function groupFields(input: GroupInput) {
  return {
    name: input.name,
    description: input.description ?? null,
    avatarUrl: input.avatarUrl ?? null,
  };
}

async function memberWithUser(tx: Tx, membershipId: string) {
  return (
    (await tx.query.groupMembers.findFirst({
      where: eq(groupMembers.id, membershipId),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            handle: true,
            avatarUrl: true,
          },
        },
      },
    })) ?? null
  );
}

export async function createGroup(input: GroupInput, user: User) {
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, groupSlug(input.name));
    const [group] = await tx
      .insert(groups)
      .values({
        ...groupFields(input),
        slug,
        createdById: user.id,
      })
      .returning({ id: groups.id, slug: groups.slug });

    if (!group) throw new DomainError("CONFLICT");

    await tx.insert(groupMembers).values({
      groupId: group.id,
      userId: user.id,
      role: "owner",
    });

    return group;
  });
}

export async function updateGroup(slugOrId: string, input: GroupInput, user: User) {
  return db.transaction(async (tx) => {
    const group = await findGroup(tx, slugOrId);
    if (!group) throw new DomainError("NOT_FOUND");

    await requireManager(tx, group.id, user);
    await tx.update(groups).set(groupFields(input)).where(eq(groups.id, group.id));

    return { slug: group.slug };
  });
}

export async function addMember(
  groupSlugOrId: string,
  actor: User,
  identifier: string,
  role: MemberRole,
) {
  return db.transaction(async (tx) => {
    const group = await findGroup(tx, groupSlugOrId);
    if (!group) throw new DomainError("NOT_FOUND");

    const actorRole = await requireManager(tx, group.id, actor);
    // Only an owner may hand out elevated roles. Admins can add regular
    // members and kids, but must not be able to mint fellow admins (or owners).
    if (role === "owner" || (role === "admin" && actorRole !== "owner")) {
      throw new DomainError("FORBIDDEN");
    }

    const target = await findUserByIdentifier(tx, identifier);
    if (!target) throw new DomainError("USER_NOT_FOUND");

    const existing = await membershipFor(tx, group.id, target.id);
    if (existing) throw new DomainError("ALREADY_MEMBER");

    const [inserted] = await tx
      .insert(groupMembers)
      .values({ groupId: group.id, userId: target.id, role })
      .returning({ id: groupMembers.id });

    if (!inserted) throw new DomainError("CONFLICT");

    const member = await memberWithUser(tx, inserted.id);
    if (!member) throw new DomainError("CONFLICT");

    // Count after the insert so the caller can bucket the group's size for
    // analytics without ever seeing individual members.
    const members = await tx.query.groupMembers.findMany({
      where: eq(groupMembers.groupId, group.id),
      columns: { id: true },
    });
    return { ...member, memberCount: members.length };
  });
}

export async function updateMemberRole(
  groupSlugOrId: string,
  actor: User,
  memberUserId: string,
  role: MemberRole,
) {
  return db.transaction(async (tx) => {
    const group = await findGroup(tx, groupSlugOrId);
    if (!group) throw new DomainError("NOT_FOUND");

    await requireOwner(tx, group.id, actor);
    if (role === "owner") throw new DomainError("FORBIDDEN");

    const target = await membershipFor(tx, group.id, memberUserId);
    if (!target) throw new DomainError("NOT_FOUND");
    if (target.role === "owner") throw new DomainError("FORBIDDEN");

    const [updated] = await tx
      .update(groupMembers)
      .set({ role })
      .where(eq(groupMembers.id, target.id))
      .returning({ id: groupMembers.id });

    if (!updated) throw new DomainError("NOT_FOUND");

    const member = await memberWithUser(tx, updated.id);
    if (!member) throw new DomainError("NOT_FOUND");
    return member;
  });
}

export async function removeMember(
  groupSlugOrId: string,
  actor: User,
  memberUserId: string,
) {
  return db.transaction(async (tx) => {
    const group = await findGroup(tx, groupSlugOrId);
    if (!group) throw new DomainError("NOT_FOUND");

    const actorRole = await requireManager(tx, group.id, actor);
    const target = await membershipFor(tx, group.id, memberUserId);
    if (!target) throw new DomainError("NOT_FOUND");
    if (target.role === "owner") throw new DomainError("FORBIDDEN");
    if (
      actorRole !== "owner" &&
      target.role === "admin" &&
      target.userId !== actor.id
    ) {
      throw new DomainError("FORBIDDEN");
    }

    await tx.delete(groupMembers).where(eq(groupMembers.id, target.id));
    return { slug: group.slug };
  });
}

export async function leaveGroup(groupSlugOrId: string, user: User) {
  return db.transaction(async (tx) => {
    const group = await findGroup(tx, groupSlugOrId);
    if (!group) throw new DomainError("NOT_FOUND");

    const membership = await membershipFor(tx, group.id, user.id);
    if (!membership) throw new DomainError("NOT_FOUND");

    if (membership.role === "owner") {
      const owners = await tx.query.groupMembers.findMany({
        where: and(eq(groupMembers.groupId, group.id), eq(groupMembers.role, "owner")),
        columns: { id: true },
      });
      if (owners.length <= 1) throw new DomainError("OWNER_CANT_LEAVE");
    }

    await tx.delete(groupMembers).where(eq(groupMembers.id, membership.id));
    return { slug: group.slug, groupId: group.id };
  });
}

export async function deleteGroup(groupSlugOrId: string, user: User) {
  return db.transaction(async (tx) => {
    const group = await findGroup(tx, groupSlugOrId);
    if (!group) throw new DomainError("NOT_FOUND");

    await requireOwner(tx, group.id, user);

    // Group-visibility recipes reference this group. Once it's gone the FK is
    // nulled and `canView` can never match them again, hiding them from
    // everyone but their author. Downgrade them to private (and detach the
    // group) in the same transaction so their owners keep access.
    await tx
      .update(recipes)
      .set({ visibility: "private", groupId: null })
      .where(
        and(eq(recipes.groupId, group.id), eq(recipes.visibility, "group")),
      );

    const [deleted] = await tx
      .delete(groups)
      .where(eq(groups.id, group.id))
      .returning({ slug: groups.slug });

    if (!deleted) throw new DomainError("NOT_FOUND");
    return { slug: deleted.slug, groupId: group.id };
  });
}

export async function transferOwnership(
  groupSlugOrId: string,
  owner: User,
  newOwnerUserId: string,
) {
  return db.transaction(async (tx) => {
    const group = await findGroup(tx, groupSlugOrId);
    if (!group) throw new DomainError("NOT_FOUND");
    if (owner.id === newOwnerUserId) throw new DomainError("CONFLICT");

    await requireOwner(tx, group.id, owner);

    const target = await membershipFor(tx, group.id, newOwnerUserId);
    if (!target) throw new DomainError("NOT_FOUND");
    if (target.role === "owner") throw new DomainError("CONFLICT");

    await tx
      .update(groupMembers)
      .set({ role: "owner" })
      .where(eq(groupMembers.id, target.id));

    const currentOwner = await membershipFor(tx, group.id, owner.id);
    if (!currentOwner) throw new DomainError("FORBIDDEN");
    await tx
      .update(groupMembers)
      .set({ role: "admin" })
      .where(eq(groupMembers.id, currentOwner.id));

    return { slug: group.slug };
  });
}

/**
 * Invite someone to a group (issue #181). Only owner/admin may invite, and only
 * an owner may invite as an admin. Creates a `pending` invitation carrying an
 * opaque accept token and an expiry; if the invitee's email/handle already maps
 * to an account it's pre-linked (and rejected if they're already a member). A
 * duplicate *pending* invite for the same contact is refused (also enforced at
 * the DB for email via the partial unique index).
 */
export async function createInvitation(
  groupSlugOrId: string,
  actor: User,
  input: InviteInput,
) {
  const data = inviteInput.parse(input);
  const email = data.email ?? null;
  const handle = normalizeHandle(data.handle);
  if (!email && !handle) throw new DomainError("INVALID");

  return db.transaction(async (tx) => {
    const group = await findGroup(tx, groupSlugOrId);
    if (!group) throw new DomainError("NOT_FOUND");

    const actorRole = await requireManager(tx, group.id, actor);
    // Mirror addMember: an admin can invite members/kids but not fellow admins.
    if (data.role === "admin" && actorRole !== "owner") {
      throw new DomainError("FORBIDDEN");
    }

    // Pre-link an existing account (and reject inviting a current member).
    const target = await findUserByIdentifier(tx, email ?? handle!);
    if (target) {
      const existingMember = await membershipFor(tx, group.id, target.id);
      if (existingMember) throw new DomainError("ALREADY_MEMBER");
    }

    const duplicate = await tx.query.groupInvitations.findFirst({
      where: and(
        eq(groupInvitations.groupId, group.id),
        eq(groupInvitations.status, "pending"),
        email
          ? eq(groupInvitations.email, email)
          : eq(groupInvitations.handle, handle!),
      ),
      columns: { id: true },
    });
    if (duplicate) throw new DomainError("ALREADY_INVITED");

    const [invitation] = await tx
      .insert(groupInvitations)
      .values({
        groupId: group.id,
        invitedById: actor.id,
        userId: target?.id ?? null,
        email,
        handle,
        role: data.role,
        token: generateInviteToken(),
        status: "pending",
        expiresAt: new Date(Date.now() + data.expiresInDays * DAY_MS),
      })
      .returning({
        id: groupInvitations.id,
        token: groupInvitations.token,
        status: groupInvitations.status,
        expiresAt: groupInvitations.expiresAt,
      });

    if (!invitation) throw new DomainError("CONFLICT");
    return invitation;
  });
}

/**
 * Accept an invitation by its token (issue #181). Transactionally creates the
 * membership with the invited role and marks the invite `accepted`. Idempotent:
 * if the accepting user is already a member no duplicate row is created
 * (respecting `group_members_group_user_uq`). Lazily expires an overdue invite.
 */
export async function acceptInvitation(token: string, user: User) {
  return db.transaction(async (tx) => {
    const invitation = await tx.query.groupInvitations.findFirst({
      where: eq(groupInvitations.token, token),
    });
    if (!invitation) throw new DomainError("NOT_FOUND");
    if (invitation.status === "revoked") throw new DomainError("REVOKED");

    const overdue =
      invitation.expiresAt != null &&
      invitation.expiresAt.getTime() <= Date.now();
    if (invitation.status === "expired" || (invitation.status === "pending" && overdue)) {
      if (invitation.status === "pending") {
        await tx
          .update(groupInvitations)
          .set({ status: "expired" })
          .where(eq(groupInvitations.id, invitation.id));
      }
      throw new DomainError("EXPIRED");
    }

    const existing = await membershipFor(tx, invitation.groupId, user.id);

    if (invitation.status === "accepted") {
      // Already consumed. Idempotent only if this user is still the member it
      // produced; otherwise the (single-use) token can't mint a new membership.
      if (existing) {
        return { groupId: invitation.groupId, role: existing.role, alreadyMember: true };
      }
      throw new DomainError("ALREADY_ACCEPTED");
    }

    // status === "pending"
    if (existing) {
      await tx
        .update(groupInvitations)
        .set({ status: "accepted", userId: user.id })
        .where(eq(groupInvitations.id, invitation.id));
      return { groupId: invitation.groupId, role: existing.role, alreadyMember: true };
    }

    await tx.insert(groupMembers).values({
      groupId: invitation.groupId,
      userId: user.id,
      role: invitation.role,
    });
    await tx
      .update(groupInvitations)
      .set({ status: "accepted", userId: user.id })
      .where(eq(groupInvitations.id, invitation.id));

    return { groupId: invitation.groupId, role: invitation.role, alreadyMember: false };
  });
}

/**
 * Revoke a pending invitation (issue #181). Owner/admin only. Idempotent for an
 * already-revoked invite; refuses to revoke one that's been accepted/expired.
 */
export async function revokeInvitation(
  groupSlugOrId: string,
  actor: User,
  invitationId: string,
) {
  return db.transaction(async (tx) => {
    const group = await findGroup(tx, groupSlugOrId);
    if (!group) throw new DomainError("NOT_FOUND");
    await requireManager(tx, group.id, actor);

    const invitation = await tx.query.groupInvitations.findFirst({
      where: and(
        eq(groupInvitations.id, invitationId),
        eq(groupInvitations.groupId, group.id),
      ),
    });
    if (!invitation) throw new DomainError("NOT_FOUND");
    if (invitation.status === "revoked") {
      return { id: invitation.id, status: "revoked" as const };
    }
    if (invitation.status !== "pending") throw new DomainError("NOT_PENDING");

    await tx
      .update(groupInvitations)
      .set({ status: "revoked" })
      .where(eq(groupInvitations.id, invitation.id));
    return { id: invitation.id, status: "revoked" as const };
  });
}

/**
 * Create a shareable, multi-use invite link for a group (issue #343). Owner/
 * admin only. Unlike {@link createInvitation} the link carries no invitee — it's
 * a URL anyone can open to join at `role`. Role is capped to member/kid by the
 * validator so a forwarded link can never mint managers. Optional `expiresAt`
 * and `maxUses` bound its lifetime; both null = evergreen + unlimited.
 */
export async function createInviteLink(
  groupSlugOrId: string,
  actor: User,
  input: CreateInviteLinkInput,
) {
  const data = createInviteLinkInput.parse(input);

  return db.transaction(async (tx) => {
    const group = await findGroup(tx, groupSlugOrId);
    if (!group) throw new DomainError("NOT_FOUND");

    await requireManager(tx, group.id, actor);

    const [link] = await tx
      .insert(groupInviteLinks)
      .values({
        groupId: group.id,
        createdById: actor.id,
        role: data.role,
        token: generateInviteToken(),
        expiresAt:
          data.expiresInDays != null
            ? new Date(Date.now() + data.expiresInDays * DAY_MS)
            : null,
        maxUses: data.maxUses ?? null,
      })
      .returning({
        id: groupInviteLinks.id,
        token: groupInviteLinks.token,
        role: groupInviteLinks.role,
        expiresAt: groupInviteLinks.expiresAt,
        maxUses: groupInviteLinks.maxUses,
      });

    if (!link) throw new DomainError("CONFLICT");
    return { ...link, groupId: group.id, slug: group.slug };
  });
}

/**
 * Join a group via an invite link's token (issue #343). Transactionally creates
 * the membership at the link's role and bumps `useCount`. Fully guarded:
 * missing → NOT_FOUND, revoked → REVOKED, past expiry → EXPIRED, at the cap →
 * EXHAUSTED. Idempotent: an existing member is returned as-is and does *not*
 * consume a use, so refreshing the join page (or re-sharing to a member) never
 * duplicates rows or drains the cap.
 */
export async function acceptInviteLink(token: string, user: User) {
  return db.transaction(async (tx) => {
    const link = await tx.query.groupInviteLinks.findFirst({
      where: eq(groupInviteLinks.token, token),
    });
    if (!link) throw new DomainError("NOT_FOUND");
    if (link.revokedAt != null) throw new DomainError("REVOKED");
    if (link.expiresAt != null && link.expiresAt.getTime() <= Date.now()) {
      throw new DomainError("EXPIRED");
    }

    const group = await tx.query.groups.findFirst({
      where: eq(groups.id, link.groupId),
      columns: { id: true, slug: true },
    });
    if (!group) throw new DomainError("NOT_FOUND");

    const existing = await membershipFor(tx, link.groupId, user.id);
    if (existing) {
      // Already in — idempotent, and crucially we don't spend a use.
      return {
        groupId: link.groupId,
        slug: group.slug,
        role: existing.role,
        alreadyMember: true,
      };
    }

    // Claim a use with a single conditional bump. The WHERE re-checks the cap
    // (plus revocation/expiry) against the *current* row under its write lock,
    // so two users redeeming a maxUses=1 link concurrently serialize here: the
    // loser matches 0 rows (useCount has already reached maxUses) and is
    // rejected. The read-time guards above only produce friendlier errors; this
    // atomic UPDATE is what actually enforces the cap, closing the
    // check-then-insert race. Seat the member only after the bump succeeds, in
    // the same tx so any later failure rolls the increment back.
    const now = new Date();
    const claimed = await tx
      .update(groupInviteLinks)
      .set({ useCount: sql`${groupInviteLinks.useCount} + 1` })
      .where(
        and(
          eq(groupInviteLinks.id, link.id),
          isNull(groupInviteLinks.revokedAt),
          or(
            isNull(groupInviteLinks.expiresAt),
            gt(groupInviteLinks.expiresAt, now),
          ),
          or(
            isNull(groupInviteLinks.maxUses),
            lt(groupInviteLinks.useCount, groupInviteLinks.maxUses),
          ),
        ),
      )
      .returning({ id: groupInviteLinks.id });
    if (claimed.length === 0) throw new DomainError("EXHAUSTED");

    await tx.insert(groupMembers).values({
      groupId: link.groupId,
      userId: user.id,
      role: link.role,
    });

    return {
      groupId: link.groupId,
      slug: group.slug,
      role: link.role,
      alreadyMember: false,
    };
  });
}
