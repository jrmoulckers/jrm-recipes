"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  addEntryInput,
  batchCookInput,
  copyWeekInput,
  moveEntryInput,
  removeEntryInput,
  type AddEntryInput,
  type BatchCookInput,
  type CopyWeekInput,
  type MoveEntryInput,
  type RemoveEntryInput,
} from "./validation";
import {
  addBatchCook,
  addEntry,
  copyPreviousWeek,
  moveEntry,
  removeEntry,
} from "./mutations";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type CopyWeekActionResult =
  | { ok: true; copied: number; previousEmpty: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const NO_DB =
  "The meal planner needs a database. Set DATABASE_URL (see .env.example) to start planning.";

function messageFor(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "NOT_FOUND":
      return "We couldn't find that item on your plan.";
    case "FORBIDDEN":
      return "You don't have access to that recipe.";
    default:
      return "We couldn't update your plan. Please try again.";
  }
}

export async function addEntryAction(
  input: AddEntryInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = addEntryInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await addEntry(parsed.data, user);
    revalidatePath("/plan");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function moveEntryAction(
  input: MoveEntryInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = moveEntryInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await moveEntry(parsed.data, user);
    revalidatePath("/plan");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function removeEntryAction(
  input: RemoveEntryInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = removeEntryInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await removeEntry(parsed.data.entryId, user);
    revalidatePath("/plan");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function addBatchCookAction(
  input: BatchCookInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = batchCookInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await addBatchCook(parsed.data, user);
    revalidatePath("/plan");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function copyPreviousWeekAction(
  input: CopyWeekInput,
): Promise<CopyWeekActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = copyWeekInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    const result = await copyPreviousWeek(user, parsed.data.week);
    revalidatePath("/plan");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
