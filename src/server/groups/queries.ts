import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

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

/**
 * Whether a recipe belongs in a group's rendered cookbook for `viewer`. This is
 * the listing counterpart to {@link canView} (issues #204/#165): it decides what
 * a group page *shows*, not just what an individual recipe grants on direct
 * access, and it must never be looser than `canView`.
 *
 * - Tombstoned (soft-deleted) recipes are never listed.
 * - The author always sees their own recipe in their group's cookbook.
 * - Non-members (the public cookbook view) only ever see recipes that are both
 *   `public` and `published` — never drafts, `group`, `unlisted`, or `private`.
 * - Members see recipes explicitly shared to the group (`group`) plus `public`
 *   ones, but NOT a fellow member's `private` (author-only) or `unlisted`
 *   (share-token-only) recipes.
 */
export function canListInGroupCookbook(
  recipe: {
    authorId: string;
    visibility: string;
    status: string;
    deletedAt: Date | null;
  },
  viewer: User | null,
  isMember: boolean,
): boolean {
  if (recipe.deletedAt != null) return false;
  if (recipe.authorId === viewer?.id) return true;
  if (!isMember) {
    return recipe.visibility === "public" && recipe.status === "published";
  }
  return recipe.visibility === "group" || recipe.visibility === "public";
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
      where: and(inArray(recipes.groupId, groupIds), isNull(recipes.deletedAt)),
      columns: { groupId: true },
    }),
  ]);

  const memberCounts = new Map<string, number>();
  for (const member of allMembers) {
    memberCounts.set(
      member.groupId,
      (memberCounts.get(member.groupId) ?? 0) + 1,
    );
  }

  const recipeCounts = new Map<string, number>();
  for (const recipe of groupRecipes) {
    if (!recipe.groupId) continue;
    recipeCounts.set(
      recipe.groupId,
      (recipeCounts.get(recipe.groupId) ?? 0) + 1,
    );
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
  const isMember = viewerRole != null;

  // Fetch the group's live (non-tombstoned) recipes, then apply the same
  // listing rule as `canView` (issues #204/#165) so the cookbook never leaks a
  // member's private/unlisted recipe to others, nor a public draft to
  // non-members. Family cookbooks are small, so filtering in memory keeps the
  // predicate a single source of truth (mirroring getRecipe -> canView).
  const groupRecipes = await db.query.recipes.findMany({
    where: and(eq(recipes.groupId, group.id), isNull(recipes.deletedAt)),
    orderBy: [desc(recipes.updatedAt)],
    columns: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverImageUrl: true,
      visibility: true,
      status: true,
      authorId: true,
      deletedAt: true,
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

  const visibleRecipes = groupRecipes.filter((recipe) =>
    canListInGroupCookbook(recipe, viewer, isMember),
  );

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
      where: and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
      ),
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
