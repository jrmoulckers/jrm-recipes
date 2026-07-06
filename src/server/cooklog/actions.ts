"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  deleteCookLogInput,
  logCookInput,
  type DeleteCookLogInput,
  type LogCookFormInput,
} from "./validation";
import { createCookLog, deleteCookLog } from "./mutations";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const NO_DB =
  "The cooking journal needs a database. Set DATABASE_URL (see .env.example) to start logging cooks.";

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : "";
}

function revalidateCookViews(recipeSlug: string) {
  revalidatePath(`/recipes/${recipeSlug}`);
  revalidatePath("/journal");
}

export async function logCookAction(
  input: LogCookFormInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = logCookInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await createCookLog(parsed.data, user);
    revalidateCookViews(parsed.data.recipeSlug);
    return { ok: true };
  } catch (error) {
    if (errorCode(error) === "NOT_FOUND") {
      return { ok: false, error: "We couldn't find that recipe." };
    }
    return { ok: false, error: "We couldn't save that to your journal." };
  }
}

export async function deleteCookLogAction(
  input: DeleteCookLogInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = deleteCookLogInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await deleteCookLog(parsed.data.entryId, user);
    revalidateCookViews(parsed.data.recipeSlug);
    return { ok: true };
  } catch (error) {
    if (errorCode(error) === "NOT_FOUND") {
      return { ok: false, error: "That journal entry is already gone." };
    }
    return { ok: false, error: "We couldn't remove that journal entry." };
  }
}
