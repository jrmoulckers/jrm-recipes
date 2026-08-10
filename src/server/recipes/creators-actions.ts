"use server";

import { z } from "zod";

import { authedAction } from "~/server/action";
import { type ActionResult, fail, ok } from "~/server/action-result";
import { messageForError } from "~/server/errors";
import { checkRateLimit, RATE_LIMITED_MESSAGE } from "~/server/rate-limit";
import {
  acceptRecipeCreatorInvite,
  declineRecipeCreatorInvite,
  inviteRecipeCreator,
  leaveRecipeAsCreator,
  removeRecipeCreator,
  type CreatorRemoval,
} from "./creators";
import { revalidateRecipePaths, revalidateRecipeTags } from "./revalidate";

/**
 * Server actions for the co-creator lifecycle (issue #668).
 *
 * Kept out of `actions.ts` because these are membership operations, not recipe
 * edits: they change *who* a recipe belongs to rather than what it says. Every
 * one is authenticated, rate-limited on the recipe-write budget, and followed
 * by a path fan-out — the last is not cosmetic, since a removal that skips it
 * leaves the revoked creator's page serving from the App Router cache.
 */

/** Copy tailored to this flow, so a generic code reads sensibly in context. */
const MESSAGES = {
  NOT_FOUND: "We couldn't find that recipe.",
  FORBIDDEN: "Only the recipe's owner can manage co-creators.",
  USER_NOT_FOUND: "No cook found with that handle. Ask them to sign up first.",
  ALREADY_INVITED: "They've already been invited to co-create this recipe.",
  ALREADY_ACCEPTED: "They're already a co-creator of this recipe.",
  NOT_PENDING: "That invitation is no longer pending.",
  OWNER_CANT_LEAVE: "You own this recipe, so you can't step down from it.",
} as const;

const recipeCreatorInput = z.object({
  recipeId: z.string().min(1),
  userId: z.string().min(1),
});

const recipeOnlyInput = z.object({ recipeId: z.string().min(1) });

/** Bust every path the recipe answers on, including the one just revoked. */
async function fanOut(removal: CreatorRemoval): Promise<void> {
  // The removed creator's namespace is passed explicitly because their row is
  // already gone and can no longer be discovered — and it is precisely the page
  // that must stop being served.
  await revalidateRecipePaths(
    removal.recipe,
    removal.removed ? [removal.removed] : [],
  );
  revalidateRecipeTags(removal.recipe.id);
}

/** Invite a cook to co-create a recipe. Owner only; grants nothing until accepted. */
export const inviteRecipeCreatorAction = authedAction({
  input: recipeCreatorInput,
  handler: async (data, user): Promise<ActionResult> => {
    if (!checkRateLimit("recipeWrite", user.id).ok)
      return fail(RATE_LIMITED_MESSAGE);
    try {
      await inviteRecipeCreator(data.recipeId, user.id, data.userId);
      return ok();
    } catch (error) {
      return fail(messageForError(error, MESSAGES));
    }
  },
});

/** Accept an invitation. Allocates the caller's namespace slug and grants access. */
export const acceptRecipeCreatorAction = authedAction({
  input: recipeOnlyInput,
  handler: async (data, user): Promise<ActionResult<{ slug: string }>> => {
    if (!checkRateLimit("recipeWrite", user.id).ok)
      return fail(RATE_LIMITED_MESSAGE);
    try {
      const { slug } = await acceptRecipeCreatorInvite(data.recipeId, user.id);
      // The new creator path has to start being served immediately, so the
      // whole fan-out runs rather than just the canonical path.
      await revalidateRecipePaths({ id: data.recipeId, slug: null });
      revalidateRecipeTags(data.recipeId);
      return ok({ slug });
    } catch (error) {
      return fail(messageForError(error, MESSAGES));
    }
  },
});

/** Decline an invitation. Deletes the pending row; nothing was ever granted. */
export const declineRecipeCreatorAction = authedAction({
  input: recipeOnlyInput,
  handler: async (data, user): Promise<ActionResult> => {
    if (!checkRateLimit("recipeWrite", user.id).ok)
      return fail(RATE_LIMITED_MESSAGE);
    try {
      await declineRecipeCreatorInvite(data.recipeId, user.id);
      return ok();
    } catch (error) {
      return fail(messageForError(error, MESSAGES));
    }
  },
});

/** Remove a co-creator. Owner only. Revokes access, frees the slug, purges the path. */
export const removeRecipeCreatorAction = authedAction({
  input: recipeCreatorInput,
  handler: async (data, user): Promise<ActionResult> => {
    if (!checkRateLimit("recipeWrite", user.id).ok)
      return fail(RATE_LIMITED_MESSAGE);
    try {
      await fanOut(
        await removeRecipeCreator(data.recipeId, user.id, data.userId),
      );
      return ok();
    } catch (error) {
      return fail(messageForError(error, MESSAGES));
    }
  },
});

/** Step down as a co-creator. Same revocation, authorized by being the subject. */
export const leaveRecipeAsCreatorAction = authedAction({
  input: recipeOnlyInput,
  handler: async (data, user): Promise<ActionResult> => {
    if (!checkRateLimit("recipeWrite", user.id).ok)
      return fail(RATE_LIMITED_MESSAGE);
    try {
      await fanOut(await leaveRecipeAsCreator(data.recipeId, user.id));
      return ok();
    } catch (error) {
      return fail(messageForError(error, MESSAGES));
    }
  },
});
