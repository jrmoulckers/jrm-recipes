import "server-only";

import { and, eq, or, sql } from "drizzle-orm";

import { slugify } from "~/lib/utils";
import { db } from "~/server/db";
import {
  groupMembers,
  groups,
  users,
  type MemberRole,
  type User,
} from "~/server/db/schema";
import { type GroupInput } from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const MANAGER_ROLES = new Set<MemberRole>(["owner", "admin"]);

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
  if (!membership) throw new Error("FORBIDDEN");
  return membership.role;
}

async function requireManager(tx: Tx, groupId: string, actor: User) {
  const role = await requireActorRole(tx, groupId, actor);
  if (!MANAGER_ROLES.has(role)) throw new Error("FORBIDDEN");
  return role;
}

async function requireOwner(tx: Tx, groupId: string, actor: User) {
  const role = await requireActorRole(tx, groupId, actor);
  if (role !== "owner") throw new Error("FORBIDDEN");
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

    if (!group) throw new Error("CONFLICT");

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
    if (!group) throw new Error("NOT_FOUND");

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
    if (!group) throw new Error("NOT_FOUND");

    await requireManager(tx, group.id, actor);
    if (role === "owner") throw new Error("FORBIDDEN");

    const target = await findUserByIdentifier(tx, identifier);
    if (!target) throw new Error("USER_NOT_FOUND");

    const existing = await membershipFor(tx, group.id, target.id);
    if (existing) throw new Error("ALREADY_MEMBER");

    const [inserted] = await tx
      .insert(groupMembers)
      .values({ groupId: group.id, userId: target.id, role })
      .returning({ id: groupMembers.id });

    if (!inserted) throw new Error("CONFLICT");

    const member = await memberWithUser(tx, inserted.id);
    if (!member) throw new Error("CONFLICT");
    return member;
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
    if (!group) throw new Error("NOT_FOUND");

    await requireOwner(tx, group.id, actor);
    if (role === "owner") throw new Error("FORBIDDEN");

    const target = await membershipFor(tx, group.id, memberUserId);
    if (!target) throw new Error("NOT_FOUND");
    if (target.role === "owner") throw new Error("FORBIDDEN");

    const [updated] = await tx
      .update(groupMembers)
      .set({ role })
      .where(eq(groupMembers.id, target.id))
      .returning({ id: groupMembers.id });

    if (!updated) throw new Error("NOT_FOUND");

    const member = await memberWithUser(tx, updated.id);
    if (!member) throw new Error("NOT_FOUND");
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
    if (!group) throw new Error("NOT_FOUND");

    const actorRole = await requireManager(tx, group.id, actor);
    const target = await membershipFor(tx, group.id, memberUserId);
    if (!target) throw new Error("NOT_FOUND");
    if (target.role === "owner") throw new Error("FORBIDDEN");
    if (
      actorRole !== "owner" &&
      target.role === "admin" &&
      target.userId !== actor.id
    ) {
      throw new Error("FORBIDDEN");
    }

    await tx.delete(groupMembers).where(eq(groupMembers.id, target.id));
    return { slug: group.slug };
  });
}

export async function leaveGroup(groupSlugOrId: string, user: User) {
  return db.transaction(async (tx) => {
    const group = await findGroup(tx, groupSlugOrId);
    if (!group) throw new Error("NOT_FOUND");

    const membership = await membershipFor(tx, group.id, user.id);
    if (!membership) throw new Error("NOT_FOUND");

    if (membership.role === "owner") {
      const owners = await tx.query.groupMembers.findMany({
        where: and(eq(groupMembers.groupId, group.id), eq(groupMembers.role, "owner")),
        columns: { id: true },
      });
      if (owners.length <= 1) throw new Error("OWNER_CANT_LEAVE");
    }

    await tx.delete(groupMembers).where(eq(groupMembers.id, membership.id));
    return { slug: group.slug };
  });
}

export async function deleteGroup(groupSlugOrId: string, user: User) {
  return db.transaction(async (tx) => {
    const group = await findGroup(tx, groupSlugOrId);
    if (!group) throw new Error("NOT_FOUND");

    await requireOwner(tx, group.id, user);

    const [deleted] = await tx
      .delete(groups)
      .where(eq(groups.id, group.id))
      .returning({ slug: groups.slug });

    if (!deleted) throw new Error("NOT_FOUND");
    return deleted;
  });
}

export async function transferOwnership(
  groupSlugOrId: string,
  owner: User,
  newOwnerUserId: string,
) {
  return db.transaction(async (tx) => {
    const group = await findGroup(tx, groupSlugOrId);
    if (!group) throw new Error("NOT_FOUND");
    if (owner.id === newOwnerUserId) throw new Error("CONFLICT");

    await requireOwner(tx, group.id, owner);

    const target = await membershipFor(tx, group.id, newOwnerUserId);
    if (!target) throw new Error("NOT_FOUND");
    if (target.role === "owner") throw new Error("CONFLICT");

    await tx
      .update(groupMembers)
      .set({ role: "owner" })
      .where(eq(groupMembers.id, target.id));

    const currentOwner = await membershipFor(tx, group.id, owner.id);
    if (!currentOwner) throw new Error("FORBIDDEN");
    await tx
      .update(groupMembers)
      .set({ role: "admin" })
      .where(eq(groupMembers.id, currentOwner.id));

    return { slug: group.slug };
  });
}
