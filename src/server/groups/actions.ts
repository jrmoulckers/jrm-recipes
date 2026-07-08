"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { captureServer } from "~/lib/analytics/server";
import { groupSizeBucket } from "~/lib/analytics/groups";
import { absoluteUrl } from "~/lib/utils";
import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  type ActionFailure,
  type ActionResult as BaseActionResult,
  fail,
  fromZodError,
} from "~/server/action-result";
import { messageForError, type DomainMessages } from "~/server/errors";
import {
  acceptInviteLink,
  addMember,
  createGroup,
  createInviteLink,
  deleteGroup,
  leaveGroup,
  removeMember,
  transferOwnership,
  updateGroup,
  updateMemberRole,
} from "./mutations";
import {
  addMemberInput,
  createInviteLinkInput,
  groupInput,
  updateRoleInput,
  type AddMemberInput,
  type CreateInviteLinkInput,
  type GroupInput,
  type UpdateRoleInput,
} from "./validation";

export type ActionResult = BaseActionResult<{ slug?: string }>;

const NO_DB = "Groups need a database.";

/** Group-specific copy for the shared domain-error mapper (#168). */
const GROUP_MESSAGES: DomainMessages = {
  USER_NOT_FOUND:
    "No cook found with that handle or email — ask them to sign up first.",
  ALREADY_MEMBER: "They're already in this group.",
  FORBIDDEN: "You don't have permission to do that.",
  SEAT_LIMIT_REACHED:
    "Your family plan is full. Upgrade to add more members — no one is removed.",
  OWNER_CANT_LEAVE: "Transfer ownership or delete the group first.",
  NOT_FOUND: "We couldn't find that group.",
  REVOKED: "This invite link has been turned off. Ask for a fresh one.",
  EXPIRED: "This invite link has expired. Ask for a fresh one.",
  EXHAUSTED: "This invite link has reached its limit. Ask for a fresh one.",
  CONFLICT: "That change couldn't be completed. Please refresh and try again.",
};
const GROUP_FALLBACK = "We couldn't save that group change.";

function groupError(error: unknown): ActionFailure {
  return fail(messageForError(error, GROUP_MESSAGES, GROUP_FALLBACK));
}

function revalidateGroup(slug?: string) {
  revalidatePath("/groups");
  if (slug) revalidatePath(`/groups/${slug}`);
}

export async function createGroupAction(input: GroupInput): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = groupInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    const group = await createGroup(parsed.data, user);
    revalidateGroup(group.slug);
    // A brand-new group only has its creator, so the size bucket is always "1".
    void captureServer(user.id, "group_created", {
      groupId: group.id,
      sizeBucket: "1",
    });
    return { ok: true, slug: group.slug };
  } catch (error) {
    return groupError(error);
  }
}

export async function updateGroupAction(
  slug: string,
  input: GroupInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = groupInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    const group = await updateGroup(slug, parsed.data, user);
    revalidateGroup(group.slug);
    revalidatePath(`/groups/${group.slug}/settings`);
    return { ok: true, slug: group.slug };
  } catch (error) {
    return groupError(error);
  }
}

export async function addMemberAction(
  slug: string,
  input: AddMemberInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = addMemberInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    const member = await addMember(slug, user, parsed.data.identifier, parsed.data.role);
    revalidateGroup(slug);
    const sizeBucket = groupSizeBucket(member.memberCount);
    // invite_sent is attributed to the inviter; invite_accepted is attributed
    // to the invited user (their internal id — never a handle or email). In
    // this model a member can only be added once they already have an account,
    // so their membership activates immediately: the invite is "accepted" the
    // moment it is sent.
    void captureServer(user.id, "invite_sent", {
      groupId: member.groupId,
      role: parsed.data.role,
      sizeBucket,
    });
    void captureServer(member.userId, "invite_accepted", {
      groupId: member.groupId,
      role: parsed.data.role,
    });
    return { ok: true };
  } catch (error) {
    return groupError(error);
  }
}

export async function updateMemberRoleAction(
  slug: string,
  memberUserId: string,
  input: UpdateRoleInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = updateRoleInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    const member = await updateMemberRole(slug, user, memberUserId, parsed.data.role);
    revalidateGroup(slug);
    void captureServer(user.id, "member_role_changed", {
      groupId: member.groupId,
      role: parsed.data.role,
    });
    return { ok: true };
  } catch (error) {
    return groupError(error);
  }
}

export async function removeMemberAction(
  slug: string,
  memberUserId: string,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const user = await requireUser();
  try {
    const group = await removeMember(slug, user, memberUserId);
    revalidateGroup(group.slug);
    return { ok: true, slug: group.slug };
  } catch (error) {
    return groupError(error);
  }
}

export async function leaveGroupAction(slug: string): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const user = await requireUser();
  try {
    const group = await leaveGroup(slug, user);
    revalidateGroup(group.slug);
    void captureServer(user.id, "group_left", { groupId: group.groupId });
    return { ok: true, slug: group.slug };
  } catch (error) {
    return groupError(error);
  }
}

export async function deleteGroupAction(slug: string): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const user = await requireUser();
  try {
    const group = await deleteGroup(slug, user);
    revalidateGroup(group.slug);
    void captureServer(user.id, "group_deleted", { groupId: group.groupId });
    return { ok: true, slug: group.slug };
  } catch (error) {
    return groupError(error);
  }
}

const transferOwnershipInput = z.object({
  newOwnerUserId: z.string().trim().min(1),
});

export async function transferOwnershipAction(
  slug: string,
  input: z.infer<typeof transferOwnershipInput>,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = transferOwnershipInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error, "Please choose a new owner.");

  const user = await requireUser();
  try {
    const group = await transferOwnership(slug, user, parsed.data.newOwnerUserId);
    revalidateGroup(group.slug);
    return { ok: true, slug: group.slug };
  } catch (error) {
    return groupError(error);
  }
}

export type InviteLinkResult = BaseActionResult<{ url: string; token: string }>;

/**
 * Mint a shareable invite link and hand back its absolute URL (issue #343).
 * Manager-only (enforced in the mutation). Records a non-PII
 * `invite_link_created` event attributed to the creator.
 */
export async function createInviteLinkAction(
  slug: string,
  input: CreateInviteLinkInput,
): Promise<InviteLinkResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = createInviteLinkInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    const link = await createInviteLink(slug, user, parsed.data);
    void captureServer(user.id, "invite_link_created", {
      groupId: link.groupId,
      role: parsed.data.role ?? "member",
    });
    return { ok: true, url: absoluteUrl(`/join/${link.token}`), token: link.token };
  } catch (error) {
    return groupError(error);
  }
}

export type AcceptInviteLinkResult = BaseActionResult<{
  slug: string;
  alreadyMember: boolean;
}>;

/**
 * Join a group from an invite-link token (issue #343). Used by the `/join`
 * page's CTA (and its auto-join after auth). Idempotent for existing members;
 * emits `invite_accepted` only for a genuinely new join.
 */
export async function acceptInviteLinkAction(
  token: string,
): Promise<AcceptInviteLinkResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = z.string().trim().min(1).safeParse(token);
  if (!parsed.success) return { ok: false, error: "That invite link is invalid." };

  const user = await requireUser();
  try {
    const result = await acceptInviteLink(parsed.data, user);
    revalidateGroup(result.slug);
    if (!result.alreadyMember) {
      void captureServer(user.id, "invite_accepted", {
        groupId: result.groupId,
        role: result.role,
      });
    }
    return { ok: true, slug: result.slug, alreadyMember: result.alreadyMember };
  } catch (error) {
    return groupError(error);
  }
}
