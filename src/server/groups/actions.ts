"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  addMember,
  createGroup,
  deleteGroup,
  leaveGroup,
  removeMember,
  transferOwnership,
  updateGroup,
  updateMemberRole,
} from "./mutations";
import {
  addMemberInput,
  groupInput,
  updateRoleInput,
  type AddMemberInput,
  type GroupInput,
  type UpdateRoleInput,
} from "./validation";

export type ActionResult =
  | { ok: true; slug?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const NO_DB = "Groups need a database.";

function messageFor(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "USER_NOT_FOUND":
      return "No cook found with that handle or email — ask them to sign up first.";
    case "ALREADY_MEMBER":
      return "They're already in this group.";
    case "FORBIDDEN":
      return "You don't have permission to do that.";
    case "OWNER_CANT_LEAVE":
      return "Transfer ownership or delete the group first.";
    case "NOT_FOUND":
      return "We couldn't find that group.";
    case "CONFLICT":
      return "That change couldn't be completed. Please refresh and try again.";
    default:
      return "We couldn't save that group change.";
  }
}

function revalidateGroup(slug?: string) {
  revalidatePath("/groups");
  if (slug) revalidatePath(`/groups/${slug}`);
}

export async function createGroupAction(input: GroupInput): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = groupInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    const group = await createGroup(parsed.data, user);
    revalidateGroup(group.slug);
    return { ok: true, slug: group.slug };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function updateGroupAction(
  slug: string,
  input: GroupInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = groupInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    const group = await updateGroup(slug, parsed.data, user);
    revalidateGroup(group.slug);
    revalidatePath(`/groups/${group.slug}/settings`);
    return { ok: true, slug: group.slug };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function addMemberAction(
  slug: string,
  input: AddMemberInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = addMemberInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await addMember(slug, user, parsed.data.identifier, parsed.data.role);
    revalidateGroup(slug);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function updateMemberRoleAction(
  slug: string,
  memberUserId: string,
  input: UpdateRoleInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = updateRoleInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await updateMemberRole(slug, user, memberUserId, parsed.data.role);
    revalidateGroup(slug);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
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
    return { ok: false, error: messageFor(error) };
  }
}

export async function leaveGroupAction(slug: string): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const user = await requireUser();
  try {
    const group = await leaveGroup(slug, user);
    revalidateGroup(group.slug);
    return { ok: true, slug: group.slug };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function deleteGroupAction(slug: string): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const user = await requireUser();
  try {
    const group = await deleteGroup(slug, user);
    revalidateGroup(group.slug);
    return { ok: true, slug: group.slug };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
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
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please choose a new owner.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    const group = await transferOwnership(slug, user, parsed.data.newOwnerUserId);
    revalidateGroup(group.slug);
    return { ok: true, slug: group.slug };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
