"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  createMemberProfile,
  deleteMemberProfile,
  updateMemberProfile,
} from "./mutations";
import { memberProfileInput, type MemberProfileInputRaw } from "./validation";

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const NO_DB =
  "Dietary profiles need a database. Set DATABASE_URL (see .env.example) to start saving.";

const SETTINGS_PATH = "/settings/dietary";

function messageFor(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "UNAUTHENTICATED":
      return "Sign in to manage dietary profiles.";
    case "NOT_FOUND":
      return "We couldn't find that profile.";
    case "FORBIDDEN":
      return "You can only scope a profile to a group you belong to.";
    default:
      return "We couldn't save that change.";
  }
}

function forbiddenFields(error: unknown): Record<string, string[]> | undefined {
  return error instanceof Error && error.message === "FORBIDDEN"
    ? { groupId: ["You can only scope a profile to a group you belong to."] }
    : undefined;
}

export async function createMemberProfileAction(
  input: MemberProfileInputRaw,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = memberProfileInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const user = await requireUser();
    const profile = await createMemberProfile(parsed.data, user);
    revalidatePath(SETTINGS_PATH);
    return { ok: true, id: profile.id };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(error),
      fieldErrors: forbiddenFields(error),
    };
  }
}

export async function updateMemberProfileAction(
  id: string,
  input: MemberProfileInputRaw,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = memberProfileInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const user = await requireUser();
    await updateMemberProfile(id, parsed.data, user);
    revalidatePath(SETTINGS_PATH);
    return { ok: true, id };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(error),
      fieldErrors: forbiddenFields(error),
    };
  }
}

export async function deleteMemberProfileAction(
  id: string,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  try {
    const user = await requireUser();
    await deleteMemberProfile(id, user);
    revalidatePath(SETTINGS_PATH);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
