"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  addRecipeToCollection,
  createCollection,
  deleteCollection,
  removeRecipeFromCollection,
  renameCollection,
  setCollectionVisibility,
  toggleFavorite,
} from "./mutations";
import {
  collectionInput,
  collectionRecipeInput,
  setCollectionVisibilityInput,
  toggleFavoriteInput,
  type CollectionInput,
  type CollectionRecipeInput,
  type CollectionVisibilityValue,
  type ToggleFavoriteInput,
} from "./validation";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type ToggleFavoriteResult =
  | { ok: true; favorited: boolean }
  | { ok: false; error: string };

export type CreateCollectionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const NO_DB =
  "Saving needs a database. Set DATABASE_URL (see .env.example) to start saving.";

function messageFor(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "UNAUTHENTICATED":
      return "Sign in to save recipes.";
    case "NOT_FOUND":
      return "We couldn't find that.";
    case "CONFLICT":
      return "That change couldn't be completed. Please refresh and try again.";
    default:
      return "We couldn't save that change.";
  }
}

export async function toggleFavoriteAction(
  input: ToggleFavoriteInput,
): Promise<ToggleFavoriteResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = toggleFavoriteInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "We couldn't save that recipe." };
  }

  try {
    const user = await requireUser();
    const { favorited } = await toggleFavorite(parsed.data.recipeId, user);
    revalidatePath("/collections");
    if (parsed.data.recipeSlug) {
      revalidatePath(`/recipes/${parsed.data.recipeSlug}`);
    }
    return { ok: true, favorited };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function createCollectionAction(
  input: CollectionInput,
): Promise<CreateCollectionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = collectionInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const user = await requireUser();
    const collection = await createCollection(parsed.data, user);
    revalidatePath("/collections");
    return { ok: true, id: collection.id };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function renameCollectionAction(
  id: string,
  input: CollectionInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = collectionInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const user = await requireUser();
    await renameCollection(id, parsed.data, user);
    revalidatePath("/collections");
    revalidatePath(`/collections/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function deleteCollectionAction(id: string): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  try {
    const user = await requireUser();
    await deleteCollection(id, user);
    revalidatePath("/collections");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export type SetVisibilityResult =
  | { ok: true; visibility: CollectionVisibilityValue; shareToken: string | null }
  | { ok: false; error: string };

export async function setCollectionVisibilityAction(
  id: string,
  visibility: CollectionVisibilityValue,
): Promise<SetVisibilityResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = setCollectionVisibilityInput.safeParse({ id, visibility });
  if (!parsed.success) {
    return { ok: false, error: "We couldn't update sharing for that collection." };
  }

  try {
    const user = await requireUser();
    const row = await setCollectionVisibility(
      parsed.data.id,
      parsed.data.visibility,
      user,
    );
    revalidatePath("/collections");
    revalidatePath(`/collections/${id}`);
    return {
      ok: true,
      visibility: row.visibility,
      shareToken: row.shareToken,
    };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function addRecipeToCollectionAction(
  input: CollectionRecipeInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = collectionRecipeInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "We couldn't add that recipe." };
  }

  try {
    const user = await requireUser();
    await addRecipeToCollection(
      parsed.data.collectionId,
      parsed.data.recipeId,
      user,
    );
    revalidatePath("/collections");
    revalidatePath(`/collections/${parsed.data.collectionId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function removeRecipeFromCollectionAction(
  input: CollectionRecipeInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = collectionRecipeInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "We couldn't remove that recipe." };
  }

  try {
    const user = await requireUser();
    await removeRecipeFromCollection(
      parsed.data.collectionId,
      parsed.data.recipeId,
      user,
    );
    revalidatePath("/collections");
    revalidatePath(`/collections/${parsed.data.collectionId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
