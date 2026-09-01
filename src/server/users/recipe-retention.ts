import 'server-only';

import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import { db, isDbConfigured } from '~/server/db';
import { recipeCreators, recipes } from '~/server/db/schema';
import type { RetainedRecipeMediaClassification } from '~/server/media/custody';

export type AccountRecipeRetentionPlan = {
  ownedRecipeIds: string[];
  ownedToDeleteIds: string[];
  ownedToUnclaimIds: string[];
  ownerlessToDeleteIds: string[];
  retainedCoCreatedRecipeIds: string[];
  retainedRecipes: RetainedRecipeMediaClassification[];
};

type OwnedRecipe = { id: string; createdAt: Date };
type CreatorMembership = {
  recipeId: string;
  authorId: string | null;
  visibility: string;
  createdAt: Date;
};

/** Pure classifier shared with tests so every survival edge is pinned. */
export function classifyAccountRecipeRetention(
  userId: string,
  owned: readonly OwnedRecipe[],
  memberships: readonly CreatorMembership[],
  otherAcceptedRecipeIds: ReadonlySet<string>,
): AccountRecipeRetentionPlan {
  const ownedToUnclaim = owned.filter(({ id }) => otherAcceptedRecipeIds.has(id));
  const ownedToUnclaimIds = ownedToUnclaim.map(({ id }) => id);
  const ownedToUnclaimSet = new Set(ownedToUnclaimIds);
  const ownedToDeleteIds = owned.filter(({ id }) => !ownedToUnclaimSet.has(id)).map(({ id }) => id);

  const ownerlessToDeleteIds: string[] = [];
  const retainedCoCreatedRecipeIds: string[] = [];
  const retainedRecipes = new Map<string, RetainedRecipeMediaClassification>();

  for (const recipe of ownedToUnclaim) {
    retainedRecipes.set(recipe.id, {
      recipeId: recipe.id,
      ownerId: null,
      createdAt: recipe.createdAt,
      wasOwnedByDepartingUser: true,
    });
  }

  for (const membership of memberships) {
    if (membership.authorId === userId) continue;

    const survives =
      membership.authorId !== null ||
      membership.visibility === 'public' ||
      otherAcceptedRecipeIds.has(membership.recipeId);
    if (!survives) {
      ownerlessToDeleteIds.push(membership.recipeId);
      continue;
    }

    retainedCoCreatedRecipeIds.push(membership.recipeId);
    retainedRecipes.set(membership.recipeId, {
      recipeId: membership.recipeId,
      ownerId: membership.authorId,
      createdAt: membership.createdAt,
      wasOwnedByDepartingUser: false,
    });
  }

  return {
    ownedRecipeIds: owned.map(({ id }) => id),
    ownedToDeleteIds,
    ownedToUnclaimIds,
    ownerlessToDeleteIds: [...new Set(ownerlessToDeleteIds)],
    retainedCoCreatedRecipeIds: [...new Set(retainedCoCreatedRecipeIds)],
    retainedRecipes: [...retainedRecipes.values()],
  };
}

/**
 * One survival predicate for account deletion, notice counts, and media
 * custody. Pending invitations never count as creators.
 */
export async function planAccountRecipeRetention(
  userId: string,
  executor: typeof db = db,
  lockRecipes = false,
): Promise<AccountRecipeRetentionPlan> {
  if (!isDbConfigured()) {
    return {
      ownedRecipeIds: [],
      ownedToDeleteIds: [],
      ownedToUnclaimIds: [],
      ownerlessToDeleteIds: [],
      retainedCoCreatedRecipeIds: [],
      retainedRecipes: [],
    };
  }

  const loadOwned = () =>
    executor
      .select({
        id: recipes.id,
        createdAt: recipes.createdAt,
      })
      .from(recipes)
      .where(eq(recipes.authorId, userId));
  const loadMemberships = (acceptedOnly: boolean) =>
    executor
      .select({
        recipeId: recipes.id,
        authorId: recipes.authorId,
        visibility: recipes.visibility,
        createdAt: recipes.createdAt,
      })
      .from(recipeCreators)
      .innerJoin(recipes, eq(recipes.id, recipeCreators.recipeId))
      .where(
        and(
          eq(recipeCreators.userId, userId),
          ...(acceptedOnly ? [eq(recipeCreators.status, 'accepted')] : []),
          isNull(recipes.deletedAt),
        ),
      );

  const [initialOwned, membershipCandidates] = await Promise.all([
    loadOwned(),
    loadMemberships(false),
  ]);
  let owned = initialOwned;

  const candidateIds = [
    ...new Set([
      ...owned.map(({ id }) => id),
      ...membershipCandidates.map(({ recipeId }) => recipeId),
    ]),
  ];
  if (lockRecipes && candidateIds.length > 0) {
    await executor.execute(
      sql`select 1 from ${recipes} where ${inArray(recipes.id, candidateIds)} order by ${recipes.id} for update`,
    );
    owned = await loadOwned();
  }
  const acceptedMemberships = await loadMemberships(true);
  const otherAccepted =
    candidateIds.length === 0
      ? []
      : await executor
          .select({ recipeId: recipeCreators.recipeId })
          .from(recipeCreators)
          .where(
            and(
              inArray(recipeCreators.recipeId, candidateIds),
              eq(recipeCreators.status, 'accepted'),
              ne(recipeCreators.userId, userId),
            ),
          );
  const withOtherAccepted = new Set(otherAccepted.map(({ recipeId }) => recipeId));
  return classifyAccountRecipeRetention(userId, owned, acceptedMemberships, withOtherAccepted);
}
