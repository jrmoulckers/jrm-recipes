'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, fromZodError, ok, type ActionResult } from '~/server/action-result';
import { requireUser } from '~/server/auth';
import { isDbConfigured } from '~/server/db';
import { domainCodeOf } from '~/server/errors';
import { checkRateLimit, RATE_LIMITED_MESSAGE } from '~/server/rate-limit';
import { revalidateRecipePaths, revalidateRecipeTags } from '~/server/recipes/revalidate';
import {
  applyIngredientSubstitution,
  type ApplyIngredientSubstitutionInput,
} from './substitution-mutations';

const inputSchema = z
  .object({
    recipeId: z.string().min(1).max(24),
    ingredientId: z.string().min(1).max(24),
    expectedItem: z.string().trim().min(1).max(300),
    expectedRecipeUpdatedAt: z.string().datetime({ offset: true }),
    substitute: z.string().trim().min(1).max(300),
  })
  .strict();

export type IngredientSubstitutionActionResult = ActionResult<{ updatedItem: string }>;

export async function applyIngredientSubstitutionAction(
  input: ApplyIngredientSubstitutionInput,
): Promise<IngredientSubstitutionActionResult> {
  if (!isDbConfigured()) {
    return fail(
      'Ingredient substitutions need a database. Set DATABASE_URL (see .env.example) to start saving.',
    );
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await requireUser();
    if (!checkRateLimit('recipeWrite', user.id).ok) return fail(RATE_LIMITED_MESSAGE);
    const recipe = await applyIngredientSubstitution(parsed.data, user);
    revalidatePath('/recipes');
    await revalidateRecipePaths({
      id: parsed.data.recipeId,
      slug: recipe.slug,
      cook: recipe.cook,
      authorId: recipe.authorId,
    });
    revalidateRecipeTags(parsed.data.recipeId);
    return ok({ updatedItem: parsed.data.substitute });
  } catch (error) {
    const code = domainCodeOf(error);
    if (code === 'UNAUTHENTICATED') return fail('Sign in to apply a substitution.');
    if (code === 'CONFLICT') {
      return fail('This recipe changed since you opened it. Refresh and review the swap again.');
    }
    if (code === 'INVALID') return fail('Choose one of the listed substitutions.');
    if (code === 'NOT_FOUND') {
      return fail("You don't have permission to edit this recipe.");
    }
    return fail("We couldn't apply that substitution. Try again.");
  }
}
