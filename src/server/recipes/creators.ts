import 'server-only';

import { and, eq, isNull, or, sql } from 'drizzle-orm';

import { db } from '~/server/db';
import { DomainError } from '~/server/errors';
import { transferCustodiedMediaToClaimantInTransaction } from '~/server/media/custody';
import { isPurgeComplete, purgeRecipeCustodiedMedia } from '~/server/media/purge';
import { getHiddenAuthorIds } from '~/server/moderation/blocks';
import { notify } from '~/server/notifications/notify';
import { recipeCreators, recipeEvents, recipes, users } from '~/server/db/schema';
import type { RecipeDetailRef } from '~/lib/recipe-path';
import { recipeSlug } from './validation';
import { uniqueSlug, withSlugConflictRetry } from './mutations';

/**
 * Co-creator lifecycle for multi-creator recipes (issue #668).
 *
 * Adding a creator does two things at once: it grants them access to someone
 * else's recipe, and it publishes that recipe under *their* public namespace.
 * The second is why the flow is two-sided rather than a simple owner-side
 * grant — it changes the invitee's public identity, not just their permissions,
 * so it needs their consent as well as the owner's.
 *
 * The state machine is deliberately small:
 *
 * ```
 *            invite (owner)          accept (invitee)
 *   absent ──────────────► pending ──────────────────► accepted
 *      ▲                      │                            │
 *      └──── decline (invitee)┘                            │
 *      └───────────── remove (owner) / leave (creator) ◄────┘
 * ```
 *
 * `pending` grants **nothing**: no access, no slug, no URL, no signal that the
 * recipe exists beyond the invitation itself. Access and the namespace slug are
 * both created in the accepting transaction, and both are destroyed on removal.
 */

/** The namespace entry a creator held, needed to purge their cached path. */
export type CreatorNamespace = { cook: string; slug: string };

/** What a removal freed, so the caller can revalidate what no longer resolves. */
export type CreatorRemoval = {
  recipe: {
    id: string;
    slug: string | null;
    cook: string | null;
    authorId: string | null;
  };
  /** The removed creator's namespace entry, or null if they never accepted. */
  removed: CreatorNamespace | null;
};

type RecipeForCreators = {
  id: string;
  slug: string | null;
  title: string;
  authorId: string | null;
  visibility: string;
  deletedAt: Date | null;
  author: { slug: string | null } | null;
};

/**
 * Load a live recipe for a creator operation, or throw `NOT_FOUND`.
 *
 * Soft-deleted recipes are treated as absent: they already 404 everywhere, and
 * letting an invitation be issued against one would resurrect a path for a
 * document nobody can read.
 */
async function loadRecipe(recipeId: string): Promise<RecipeForCreators> {
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)),
    columns: {
      id: true,
      slug: true,
      title: true,
      authorId: true,
      visibility: true,
      deletedAt: true,
    },
    with: { author: { columns: { slug: true } } },
  });
  if (!recipe) throw new DomainError('NOT_FOUND');
  return recipe;
}

/**
 * Load a recipe and assert `actorId` owns it, or throw.
 *
 * Every creator-management operation is owner-only, and this is the single
 * gate. `NOT_FOUND` (rather than `FORBIDDEN`) is returned to a non-owner so the
 * failure can't be used to probe which recipe ids exist.
 */
async function loadOwnedRecipe(recipeId: string, actorId: string): Promise<RecipeForCreators> {
  const recipe = await loadRecipe(recipeId);
  if (recipe.authorId !== actorId) throw new DomainError('NOT_FOUND');
  return recipe;
}

/**
 * Invite `targetUserId` to co-create `recipeId`. **Owner only.**
 *
 * Writes a `pending` row with no slug, so it grants nothing until accepted, and
 * notifies the invitee. Refuses when:
 *
 * - the actor is not the owner (`NOT_FOUND`, so it can't be used to probe ids),
 * - the target is the owner (`FORBIDDEN`) — the owner is implicit in
 *   `recipes.authorId` and must never also hold a row,
 * - the target doesn't exist or is deleted (`USER_NOT_FOUND`),
 * - either party has blocked the other (`FORBIDDEN`),
 * - a row already exists (`ALREADY_INVITED` / `ALREADY_ACCEPTED`).
 */
export async function inviteRecipeCreator(
  recipeId: string,
  ownerId: string,
  targetUserId: string,
): Promise<{ id: string }> {
  const recipe = await loadOwnedRecipe(recipeId, ownerId);
  // The owner is `recipes.authorId` and never has a row here; a self-row would
  // be a second, driftable source of truth for the same fact.
  if (targetUserId === recipe.authorId) throw new DomainError('FORBIDDEN');

  const target = await db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.id, targetUserId),
    columns: { id: true, deletedAt: true },
  });
  if (!target || target.deletedAt) throw new DomainError('USER_NOT_FOUND');

  // Blocks win over invitations, in both directions, exactly as they do over
  // follows: an invitation is an unsolicited approach at a blocked person.
  const hidden = await getHiddenAuthorIds(ownerId);
  if (hidden.has(targetUserId)) throw new DomainError('FORBIDDEN');

  const existing = await db.query.recipeCreators.findFirst({
    where: and(eq(recipeCreators.recipeId, recipeId), eq(recipeCreators.userId, targetUserId)),
    columns: { id: true, status: true },
  });
  if (existing)
    throw new DomainError(existing.status === 'accepted' ? 'ALREADY_ACCEPTED' : 'ALREADY_INVITED');

  return await db.transaction(async (tx) => {
    await tx.execute(sql`select 1 from ${recipes} where ${recipes.id} = ${recipeId} for update`);
    const currentRecipe = await tx.query.recipes.findFirst({
      where: and(
        eq(recipes.id, recipeId),
        eq(recipes.authorId, ownerId),
        isNull(recipes.deletedAt),
      ),
      columns: { title: true },
    });
    if (!currentRecipe) throw new DomainError('NOT_FOUND');

    const [row] = await tx
      .insert(recipeCreators)
      .values({
        recipeId,
        userId: targetUserId,
        invitedById: ownerId,
        status: 'pending',
      })
      .returning({ id: recipeCreators.id });
    await notify(tx, {
      recipientId: targetUserId,
      actorId: ownerId,
      type: 'recipe_creator_invite',
      recipeId,
      context: currentRecipe.title,
    });
    return { id: row!.id };
  });
}

/**
 * Accept a pending invitation. **Invitee only.**
 *
 * Allocates the slug the recipe will answer on inside the accepting user's
 * namespace and flips the row to `accepted`, atomically — the DB CHECK requires
 * an accepted row to carry both a slug and a timestamp, so a half-applied
 * acceptance is not representable.
 *
 * The base is the recipe's *title* slug, not the owner's stored slug: if the
 * owner's own slug was perturbed (`apple-pie-2ab`, because they already had an
 * `apple-pie`), the invitee should still get the clean `apple-pie` when their
 * namespace is free. Allocation perturbs strictly within the invitee's
 * namespace, so the owner's slug is never touched.
 *
 * Returns the accepted `slug` **and** the owner's canonical namespace, because
 * the caller has to bust both: the newly served creator path, and the owner's
 * page, whose byline has just gained a co-creator. The caller only holds a
 * recipe id, so without this it cannot name the canonical path at all and can
 * only revalidate the `/recipes/<id>` form nobody links to.
 */
export async function acceptRecipeCreatorInvite(
  recipeId: string,
  userId: string,
): Promise<{ recipe: RecipeDetailRef; slug: string }> {
  return await withSlugConflictRetry(() =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select 1 from ${recipes} where ${recipes.id} = ${recipeId} for update`);
      const recipe = await tx.query.recipes.findFirst({
        where: and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)),
        columns: {
          id: true,
          slug: true,
          title: true,
          authorId: true,
        },
        with: { author: { columns: { slug: true } } },
      });
      if (!recipe) throw new DomainError('NOT_FOUND');

      const invite = await tx.query.recipeCreators.findFirst({
        where: and(eq(recipeCreators.recipeId, recipeId), eq(recipeCreators.userId, userId)),
        columns: { id: true, status: true },
      });
      if (!invite) throw new DomainError('NOT_FOUND');
      if (invite.status === 'accepted') throw new DomainError('ALREADY_ACCEPTED');

      // `recipeSlug` can return an empty string for a title with no slug-able
      // characters, so an explicit emptiness check is used rather than `??`.
      const titleSlug = recipeSlug(recipe.title);
      const base = titleSlug.length > 0 ? titleSlug : (recipe.slug ?? recipe.id);
      const slug = await uniqueSlug(tx, userId, base);

      // Guarded on `status` so two concurrent accepts can't both allocate: the
      // loser updates zero rows and is reported as no longer pending.
      const updated = await tx
        .update(recipeCreators)
        .set({ status: 'accepted', slug, acceptedAt: new Date() })
        .where(and(eq(recipeCreators.id, invite.id), eq(recipeCreators.status, 'pending')))
        .returning({ id: recipeCreators.id });
      if (updated.length === 0) throw new DomainError('NOT_PENDING');

      if (recipe.authorId) {
        await notify(tx, {
          recipientId: recipe.authorId,
          actorId: userId,
          type: 'recipe_creator_accepted',
          recipeId,
          context: recipe.title,
        });
      }

      return {
        recipe: {
          id: recipe.id,
          slug: recipe.slug,
          cook: recipe.author?.slug ?? null,
          authorId: recipe.authorId,
        },
        slug,
      };
    }),
  );
}

export type RecipeClaim = {
  before: RecipeDetailRef;
  after: RecipeDetailRef;
  removed: CreatorNamespace;
};

/**
 * Atomically promote an accepted creator to owner of an unclaimed recipe.
 *
 * The conditional recipe update is the race arbiter: only one transaction can
 * change a NULL author. The winner adopts their already-public creator slug and
 * loses their creator row so ownership is represented exactly once.
 */
export async function claimRecipe(recipeId: string, userId: string): Promise<RecipeClaim> {
  return db.transaction(async (tx) => {
    const recipe = await tx.query.recipes.findFirst({
      where: and(eq(recipes.id, recipeId), isNull(recipes.authorId), isNull(recipes.deletedAt)),
      columns: { id: true, slug: true },
    });
    if (!recipe) throw new DomainError('CONFLICT');

    const creator = await tx.query.recipeCreators.findFirst({
      where: and(
        eq(recipeCreators.recipeId, recipeId),
        eq(recipeCreators.userId, userId),
        eq(recipeCreators.status, 'accepted'),
      ),
      columns: { id: true, slug: true },
      with: { user: { columns: { slug: true } } },
    });
    if (!creator?.slug || !creator.user?.slug) throw new DomainError('NOT_FOUND');

    const [claimed] = await tx
      .update(recipes)
      .set({ authorId: userId, slug: creator.slug, updatedAt: new Date() })
      .where(and(eq(recipes.id, recipeId), isNull(recipes.authorId), isNull(recipes.deletedAt)))
      .returning({ id: recipes.id });
    if (!claimed) throw new DomainError('CONFLICT');

    await transferCustodiedMediaToClaimantInTransaction(tx, recipeId, userId);

    await tx.delete(recipeCreators).where(eq(recipeCreators.id, creator.id));
    await tx.insert(recipeEvents).values({ recipeId, actorId: userId, type: 'claimed' });

    return {
      before: { id: recipeId, slug: recipe.slug, authorId: null },
      after: {
        id: recipeId,
        slug: creator.slug,
        cook: creator.user.slug,
        authorId: userId,
      },
      removed: { cook: creator.user.slug, slug: creator.slug },
    };
  });
}

/**
 * Decline a pending invitation. **Invitee only.**
 *
 * Deletes the row outright. No slug was ever allocated, so there is nothing to
 * free and nothing to purge — a declined invitation leaves no trace, which is
 * the point: it never granted anything.
 */
export async function declineRecipeCreatorInvite(recipeId: string, userId: string): Promise<void> {
  const deleted = await db
    .delete(recipeCreators)
    .where(
      and(
        eq(recipeCreators.recipeId, recipeId),
        eq(recipeCreators.userId, userId),
        eq(recipeCreators.status, 'pending'),
      ),
    )
    .returning({ id: recipeCreators.id });
  if (deleted.length === 0) throw new DomainError('NOT_PENDING');
}

/**
 * Delete a creator row and report what stopped resolving.
 *
 * Shared by owner-initiated removal and creator-initiated leaving, because they
 * are the same operation with different authorization: the row goes, **no alias
 * is written**, and the slug is immediately free again inside that user's
 * namespace. See the `recipeCreators` schema comment for why an alias here
 * would be a leak rather than a courtesy.
 *
 * The freed namespace entry is returned rather than looked up afterwards
 * because by then the row is gone — and purging that path is the cache half of
 * revocation, without which the removed creator's page keeps being served.
 */
async function deleteCreatorRow(
  recipe: RecipeForCreators,
  userId: string,
): Promise<CreatorRemoval> {
  const result = await db.transaction(async (tx) => {
    // Serialize the membership decision per recipe. Without this lock, the last
    // two creators can each delete themselves while still seeing the other's
    // uncommitted row, leaving a non-public ownerless recipe live forever.
    await tx.execute(sql`select 1 from ${recipes} where ${recipes.id} = ${recipe.id} for update`);
    const currentRecipe = await tx.query.recipes.findFirst({
      where: and(eq(recipes.id, recipe.id), isNull(recipes.deletedAt)),
      columns: {
        id: true,
        slug: true,
        authorId: true,
        visibility: true,
      },
      with: { author: { columns: { slug: true } } },
    });
    if (!currentRecipe) throw new DomainError('NOT_FOUND');

    const [row] = await tx
      .delete(recipeCreators)
      .where(and(eq(recipeCreators.recipeId, recipe.id), eq(recipeCreators.userId, userId)))
      .returning({ slug: recipeCreators.slug, status: recipeCreators.status });
    if (row && currentRecipe.authorId === null) {
      const remaining = await tx.query.recipeCreators.findFirst({
        where: and(eq(recipeCreators.recipeId, recipe.id), eq(recipeCreators.status, 'accepted')),
        columns: { id: true },
      });
      if (!remaining && currentRecipe.visibility !== 'public') {
        const mediaPurge = await purgeRecipeCustodiedMedia(recipe.id, tx as unknown as typeof db);
        if (!isPurgeComplete(mediaPurge)) throw new Error('MEDIA_PURGE_INCOMPLETE');
        // Keep the recipe row as the lifecycle owner of any system-custodied
        // media until its terminal purge above succeeds.
        await tx
          .update(recipes)
          .set({ deletedAt: new Date(), deletedBy: userId })
          .where(and(eq(recipes.id, recipe.id), isNull(recipes.deletedAt)));
      }
    }
    return { row, currentRecipe };
  });
  const deleted = result.row;
  if (!deleted) throw new DomainError('NOT_FOUND');

  let removed: CreatorNamespace | null = null;
  if (deleted.status === 'accepted' && deleted.slug) {
    const user = await db.query.users.findFirst({
      where: (u, { eq: is }) => is(u.id, userId),
      columns: { slug: true },
    });
    if (user?.slug) removed = { cook: user.slug, slug: deleted.slug };
  }

  return {
    recipe: {
      id: recipe.id,
      slug: result.currentRecipe.slug,
      cook: result.currentRecipe.author?.slug ?? null,
      authorId: result.currentRecipe.authorId,
    },
    removed,
  };
}

/**
 * Resolve a co-creator invitation target from what the owner typed.
 *
 * Handle or email, matched case-insensitively, mirroring group invitations.
 * Deliberately **not** exposed as a search: it answers "is this exact person a
 * cook here", so it can't be used to enumerate accounts.
 */
export async function findCreatorTarget(identifier: string): Promise<{ id: string }> {
  const trimmed = identifier.trim();
  if (trimmed.length === 0) throw new DomainError('USER_NOT_FOUND');
  const handle = trimmed.replace(/^@/, '').toLowerCase();
  const email = trimmed.toLowerCase();

  const found = await db.query.users.findFirst({
    where: and(
      or(sql`lower(${users.handle}) = ${handle}`, sql`lower(${users.email}) = ${email}`),
      isNull(users.deletedAt),
    ),
    columns: { id: true },
  });
  if (!found) throw new DomainError('USER_NOT_FOUND');
  return found;
}

/**
 * Remove a co-creator. **Owner only.**
 *
 * Revokes access and frees the creator's slug in one step. Works on `pending`
 * rows too, which is how an owner rescinds an invitation before it is taken up.
 */
export async function removeRecipeCreator(
  recipeId: string,
  ownerId: string,
  targetUserId: string,
): Promise<CreatorRemoval> {
  const recipe = await loadOwnedRecipe(recipeId, ownerId);
  // The owner has no row to remove, and must never be removable from their own
  // recipe — that is the unreachable zero-creator state, by construction.
  if (targetUserId === ownerId) throw new DomainError('FORBIDDEN');
  return await deleteCreatorRow(recipe, targetUserId);
}

/**
 * Step down as a co-creator. **Self only.**
 *
 * The same delete as {@link removeRecipeCreator}, authorized by being the
 * subject rather than the owner. The owner can never take this path: they are
 * not a row, and a recipe always has exactly one owner.
 */
export async function leaveRecipeAsCreator(
  recipeId: string,
  userId: string,
): Promise<CreatorRemoval> {
  const recipe = await loadRecipe(recipeId);
  if (recipe.authorId === userId) throw new DomainError('OWNER_CANT_LEAVE');
  return await deleteCreatorRow(recipe, userId);
}

/**
 * The creators of a recipe, for the owner's management panel and the byline.
 *
 * Includes `pending` rows so an owner can see and rescind an invitation they
 * have already sent; callers that drive *access* must filter to `accepted`.
 */
export async function listRecipeCreators(recipeId: string) {
  return await db.query.recipeCreators.findMany({
    where: eq(recipeCreators.recipeId, recipeId),
    columns: {
      id: true,
      userId: true,
      status: true,
      slug: true,
      invitedAt: true,
      acceptedAt: true,
    },
    with: {
      user: { columns: { id: true, name: true, slug: true, avatarUrl: true } },
    },
  });
}

/** A user's pending co-creator invitations, for their inbox. */
export async function listPendingCreatorInvites(userId: string) {
  return await db.query.recipeCreators.findMany({
    where: and(eq(recipeCreators.userId, userId), eq(recipeCreators.status, 'pending')),
    columns: { id: true, recipeId: true, invitedAt: true },
    with: {
      recipe: {
        columns: { id: true, title: true, slug: true, deletedAt: true },
        with: { author: { columns: { id: true, name: true, slug: true } } },
      },
    },
  });
}
