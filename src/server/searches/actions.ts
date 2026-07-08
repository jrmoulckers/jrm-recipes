"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { createSavedSearch, deleteSavedSearch } from "./mutations";
import {
  MAX_SAVED_SEARCHES,
  savedSearchIdInput,
  savedSearchInput,
  type SavedSearchInput,
} from "./validation";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type CreateSavedSearchResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const NO_DB =
  "Saving needs a database. Set DATABASE_URL (see .env.example) to start saving.";

function messageFor(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "UNAUTHENTICATED":
      return "Sign in to save searches.";
    case "LIMIT_REACHED":
      return `You can save up to ${MAX_SAVED_SEARCHES} searches. Delete one to add another.`;
    case "EMPTY_SEARCH":
      return "Add a filter or search term before saving.";
    case "NOT_FOUND":
      return "We couldn't find that saved search.";
    default:
      return "We couldn't save that search.";
  }
}

export async function createSavedSearchAction(
  input: SavedSearchInput,
): Promise<CreateSavedSearchResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = savedSearchInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const user = await requireUser();
    const saved = await createSavedSearch(parsed.data, user);
    revalidatePath("/recipes");
    return { ok: true, id: saved.id };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function deleteSavedSearchAction(
  id: string,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = savedSearchIdInput.safeParse({ id });
  if (!parsed.success) {
    return { ok: false, error: "We couldn't delete that saved search." };
  }

  try {
    const user = await requireUser();
    await deleteSavedSearch(parsed.data.id, user);
    revalidatePath("/recipes");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
