"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  commentInput,
  deleteCommentInput,
  ratingInput,
  removeRatingInput,
  resolveCommentInput,
  type CommentInput,
  type DeleteCommentInput,
  type RatingInput,
  type RemoveRatingInput,
  type ResolveCommentInput,
} from "./validation";
import {
  createComment,
  deleteComment,
  removeRating,
  resolveComment,
  setRating,
} from "./mutations";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : "";
}

export async function addCommentAction(
  input: CommentInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Comments need a database." };
  }
  const parsed = commentInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await createComment(parsed.data, user);
    revalidatePath(`/recipes/${parsed.data.recipeSlug}`);
    return { ok: true };
  } catch (error) {
    if (errorCode(error) === "NOT_FOUND") {
      return { ok: false, error: "We couldn't find that recipe thread." };
    }
    return { ok: false, error: "We couldn't post that." };
  }
}

export async function deleteCommentAction(
  input: DeleteCommentInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Comments need a database." };
  }
  const parsed = deleteCommentInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await deleteComment(parsed.data.commentId, user);
    revalidatePath(`/recipes/${parsed.data.recipeSlug}`);
    return { ok: true };
  } catch (error) {
    const code = errorCode(error);
    if (code === "FORBIDDEN") {
      return {
        ok: false,
        error: "Only the comment author or recipe owner can delete that.",
      };
    }
    if (code === "NOT_FOUND") {
      return { ok: false, error: "That comment is already gone." };
    }
    return { ok: false, error: "We couldn't delete that comment." };
  }
}

export async function resolveCommentAction(
  input: ResolveCommentInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Suggestions need a database." };
  }
  const parsed = resolveCommentInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await resolveComment(
      parsed.data.commentId,
      user,
      parsed.data.resolved,
    );
    revalidatePath(`/recipes/${parsed.data.recipeSlug}`);
    return { ok: true };
  } catch (error) {
    const code = errorCode(error);
    if (code === "FORBIDDEN") {
      return {
        ok: false,
        error: "Only the recipe owner can resolve suggestions.",
      };
    }
    if (code === "NOT_FOUND") {
      return { ok: false, error: "We couldn't find that suggestion." };
    }
    return { ok: false, error: "We couldn't update that suggestion." };
  }
}

export async function setRatingAction(
  input: RatingInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Ratings need a database." };
  }
  const parsed = ratingInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await setRating(parsed.data, user);
    revalidatePath(`/recipes/${parsed.data.recipeSlug}`);
    return { ok: true };
  } catch (error) {
    if (errorCode(error) === "NOT_FOUND") {
      return { ok: false, error: "We couldn't find that recipe." };
    }
    return { ok: false, error: "We couldn't save your rating." };
  }
}

export async function removeRatingAction(
  input: RemoveRatingInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Ratings need a database." };
  }
  const parsed = removeRatingInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await removeRating(parsed.data.recipeId, user);
    revalidatePath(`/recipes/${parsed.data.recipeSlug}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "We couldn't remove your rating." };
  }
}
