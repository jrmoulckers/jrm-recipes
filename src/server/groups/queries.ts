import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  groupInviteLinks,
  groupMembers,
  groups,
  recipes,
  type MemberRole,
  type User,
} from "~/server/db/schema";

const ROLE_ORDER: Record<MemberRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  kid: 3,
};

export function canManage(role: MemberRole | null | undefined): boolean {
  if (!isDbConfigured()) return false;
  return role === "owner" || role === "admin";
}

export function isOwner(role: MemberRole | null | undefined): boolean {
  if (!isDbConfigured()) return false;
  return role === "owner";
}

export async function listMyGroups(userId: string) {
  if (!isDbConfigured()) return [];

  const memberships = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    orderBy: [desc(groupMembers.updatedAt)],
    with: { group: true },
  });

  const groupIds = memberships.map((m) => m.groupId);
  if (groupIds.length === 0) return [];

  const [allMembers, groupRecipes] = await Promise.all([
    db.query.groupMembers.findMany({
      where: inArray(groupMembers.groupId, groupIds),
      columns: { groupId: true },
    }),
    db.query.recipes.findMany({
      where: inArray(recipes.groupId, groupIds),
      columns: { groupId: true },
    }),
  ]);

  const memberCounts = new Map<string, number>();
  for (const member of allMembers) {
    memberCounts.set(member.groupId, (memberCounts.get(member.groupId) ?? 0) + 1);
  }

  const recipeCounts = new Map<string, number>();
  for (const recipe of groupRecipes) {
    if (!recipe.groupId) continue;
    recipeCounts.set(recipe.groupId, (recipeCounts.get(recipe.groupId) ?? 0) + 1);
  }

  return memberships.map((membership) => ({
    id: membership.group.id,
    slug: membership.group.slug,
    name: membership.group.name,
    description: membership.group.description,
    avatarUrl: membership.group.avatarUrl,
    role: membership.role,
    memberCount: memberCounts.get(membership.groupId) ?? 0,
    recipeCount: recipeCounts.get(membership.groupId) ?? 0,
  }));
}

export async function getGroupBySlug(slug: string, viewer: User | null) {
  if (!isDbConfigured()) return null;

  const group = await db.query.groups.findFirst({
    where: eq(groups.slug, slug),
    with: {
      members: {
        orderBy: [groupMembers.createdAt],
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
      },
    },
  });

  if (!group) return null;

  const members = [...group.members].sort((a, b) => {
    const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (roleDiff !== 0) return roleDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const viewerRole =
    viewer == null
      ? null
      : (members.find((member) => member.userId === viewer.id)?.role ?? null);

  const visibleRecipes = await db.query.recipes.findMany({
    where: viewerRole
      ? eq(recipes.groupId, group.id)
      : and(eq(recipes.groupId, group.id), eq(recipes.visibility, "public")),
    orderBy: [desc(recipes.updatedAt)],
    columns: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverImageUrl: true,
      visibility: true,
      status: true,
      updatedAt: true,
    },
    with: {
      author: {
        columns: {
          id: true,
          name: true,
          handle: true,
          avatarUrl: true,
        },
      },
    },
  });

  return {
    ...group,
    members,
    recipes: visibleRecipes,
    viewerRole,
  };
}

export async function getMembership(groupId: string, userId: string) {
  if (!isDbConfigured()) return null;

  return (
    (await db.query.groupMembers.findFirst({
      where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    })) ?? null
  );
}

export type InviteLinkStatus = "active" | "expired" | "revoked" | "exhausted";

/**
 * Public-safe preview for the `/join/[token]` page (issue #343). Resolves a link
 * token to just enough of its group to render an invitation card (name, blurb,
 * avatar, member count) plus a `status` the page turns into a friendly state.
 * Deliberately leaks nothing private — no member identities, no recipes.
 */
export async function getInviteLinkPreview(token: string) {
  if (!isDbConfigured()) return null;

  const link = await db.query.groupInviteLinks.findFirst({
    where: eq(groupInviteLinks.token, token),
    with: {
      group: {
        columns: {
          id: true,
          slug: true,
          name: true,
          description: true,
          avatarUrl: true,
        },
      },
    },
  });
  if (!link) return null;

  const members = await db.query.groupMembers.findMany({
    where: eq(groupMembers.groupId, link.groupId),
    columns: { id: true },
  });

  const status: InviteLinkStatus =
    link.revokedAt != null
      ? "revoked"
      : link.expiresAt != null && link.expiresAt.getTime() <= Date.now()
        ? "expired"
        : link.maxUses != null && link.useCount >= link.maxUses
          ? "exhausted"
          : "active";

  return {
    token,
    role: link.role,
    status,
    group: link.group,
    memberCount: members.length,
  };
}

export type InviteLinkPreview = NonNullable<
  Awaited<ReturnType<typeof getInviteLinkPreview>>
>;

export type MyGroup = Awaited<ReturnType<typeof listMyGroups>>[number];
export type FullGroup = NonNullable<Awaited<ReturnType<typeof getGroupBySlug>>>;
export type FullGroupMember = FullGroup["members"][number];
export type GroupRecipe = FullGroup["recipes"][number];
