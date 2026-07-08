import { z } from "zod";

const idInput = z.string().trim().min(1);

/** Max length for a comment/suggestion body. Imported by the UI counter (#144). */
export const COMMENT_MAX_LENGTH = 4000;
/** Over-limit message — kept in sync with the field counter. */
export const COMMENT_TOO_LONG_MESSAGE = "Keep comments under 4,000 characters";

export const commentInput = z.object({
  recipeId: idInput,
  recipeSlug: idInput,
  parentId: idInput.optional(),
  kind: z.enum(["comment", "suggestion"]).default("comment"),
  body: z
    .string()
    .trim()
    .min(1, "Write a comment before posting")
    .max(COMMENT_MAX_LENGTH, COMMENT_TOO_LONG_MESSAGE),
});

export const ratingInput = z.object({
  recipeId: idInput,
  recipeSlug: idInput,
  value: z.number().int().min(1).max(5),
});

export const deleteCommentInput = z.object({
  commentId: idInput,
  recipeSlug: idInput,
});

export const resolveCommentInput = z.object({
  commentId: idInput,
  recipeSlug: idInput,
  resolved: z.boolean(),
});

export const applySuggestionInput = z.object({
  recipeId: idInput,
  recipeSlug: idInput,
  suggestionId: idInput,
});

export const removeRatingInput = z.object({
  recipeId: idInput,
  recipeSlug: idInput,
});

export type CommentInput = z.infer<typeof commentInput>;
export type RatingInput = z.infer<typeof ratingInput>;
export type DeleteCommentInput = z.infer<typeof deleteCommentInput>;
export type ResolveCommentInput = z.infer<typeof resolveCommentInput>;
export type ApplySuggestionInput = z.infer<typeof applySuggestionInput>;
export type RemoveRatingInput = z.infer<typeof removeRatingInput>;
