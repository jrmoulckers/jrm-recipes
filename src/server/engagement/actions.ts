"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { PUBLIC_RECIPES_TAG } from "~/server/recipes/cache";
import {
  type ActionResult as BaseActionResult,
  fail,
  fromZodError,
} from "~/server/action-result";
import { messageForError } from "~/server/errors";
import {
  commentInput,
  deleteCommentInput,
  ratingInput,
  removeRatingInput,
  resolveCommentInput,
  applySuggestionInput,
  type CommentInput,
  type DeleteCommentInput,
  type RatingInput,
  type RemoveRatingInput,
  type ResolveCommentInput,
  type ApplySuggestionInput,
} from "./validation";
import {
  createComment,
  deleteComment,
  removeRating,
  resolveComment,
  applySuggestion,
  setRating,
} from "./mutations";

export type ActionResult = BaseActionResult;

export async function addCommentAction(
  input: CommentInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Comments need a database." };
  }
  const parsed = commentInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await createComment(parsed.data, user);
    revalidatePath(`/recipes/${parsed.data.recipeSlug}`);
    return { ok: true };
  } catch (error) {
    return fail(
      messageForError(
        error,
        {
          FORBIDDEN: "You don't have access to this recipe.",
          NOT_FOUND: "We couldn't find that recipe thread.",
        },
        "We couldn't post that.",
      ),
    );
  }
}

export async function deleteCommentAction(
  input: DeleteCommentInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Comments need a database." };
  }
  const parsed = deleteCommentInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await deleteComment(parsed.data.commentId, user);
    revalidatePath(`/recipes/${parsed.data.recipeSlug}`);
    return { ok: true };
  } catch (error) {
    return fail(
      messageForError(
        error,
        {
          FORBIDDEN: "Only the comment author or recipe owner can delete that.",
          NOT_FOUND: "That comment is already gone.",
        },
        "We couldn't delete that comment.",
      ),
    );
  }
}

export async function resolveCommentAction(
  input: ResolveCommentInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Suggestions need a database." };
  }
  const parsed = resolveCommentInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

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
    return fail(
      messageForError(
        error,
        {
          FORBIDDEN: "Only the recipe owner can resolve suggestions.",
          ALREADY_APPLIED:
            "That suggestion was already applied and can't be reopened.",
          NOT_FOUND: "We couldn't find that suggestion.",
        },
        "We couldn't update that suggestion.",
      ),
    );
  }
}

export async function applySuggestionAction(
  input: ApplySuggestionInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Suggestions need a database." };
  }
  const parsed = applySuggestionInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await applySuggestion(
      { recipeId: parsed.data.recipeId, suggestionId: parsed.data.suggestionId },
      user,
    );
    revalidatePath(`/recipes/${parsed.data.recipeSlug}`);
    return { ok: true };
  } catch (error) {
    return fail(
      messageForError(
        error,
        {
          FORBIDDEN: "Only the recipe owner can apply suggestions.",
          ALREADY_APPLIED: "That suggestion was already applied.",
          NOT_FOUND: "We couldn't find that suggestion.",
        },
        "We couldn't apply that suggestion.",
      ),
    );
  }
}

export async function setRatingAction(
  input: RatingInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Ratings need a database." };
  }
  const parsed = ratingInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await setRating(parsed.data, user);
    revalidatePath(`/recipes/${parsed.data.recipeSlug}`);
    // The cached public "top-rated" feed ranks by live rating score, so a
    // rating change must invalidate the feed tag, not just the detail path.
    revalidateTag(PUBLIC_RECIPES_TAG);
    return { ok: true };
  } catch (error) {
    return fail(
      messageForError(
        error,
        {
          FORBIDDEN: "You don't have access to this recipe.",
          SELF_RATING: "You can't rate your own recipe.",
          NOT_FOUND: "We couldn't find that recipe.",
        },
        "We couldn't save your rating.",
      ),
    );
  }
}

export async function removeRatingAction(
  input: RemoveRatingInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Ratings need a database." };
  }
  const parsed = removeRatingInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await removeRating(parsed.data.recipeId, user);
    revalidatePath(`/recipes/${parsed.data.recipeSlug}`);
    // Removing a rating likewise re-ranks the cached public feed.
    revalidateTag(PUBLIC_RECIPES_TAG);
    return { ok: true };
  } catch (error) {
    return fail(
      messageForError(
        error,
        { FORBIDDEN: "You don't have access to this recipe." },
        "We couldn't remove your rating.",
      ),
    );
  }
}
