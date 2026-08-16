import {
  getMentionCandidates,
  getRatingBreakdown,
  getRecipeComments,
  getViewerRating,
} from '~/server/engagement/queries';
import { getViewerReview, listReviews } from '~/server/engagement/reviews';
import { getReactionsForTargets } from '~/server/engagement/reactions';
import { getHiddenAuthorIds } from '~/server/moderation/blocks';
import type { ThreadedComment } from '~/server/engagement/queries';
import type { User } from '~/server/db/schema';
import { RatingsReviewsSection } from '~/components/engagement/ratings-reviews-section-lazy';
import { CommentsSection } from '~/components/engagement/comments-section-lazy';

/** Flatten a threaded comment tree into a flat list of ids (all depths). */
function collectCommentIds(nodes: ThreadedComment[], into: string[] = []): string[] {
  for (const node of nodes) {
    into.push(node.id);
    if (node.replies.length > 0) collectCommentIds(node.replies, into);
  }
  return into;
}

/**
 * Discussion tab content (#176, reorganized in #1010). Exactly two blocks:
 *
 * 1. Ratings & reviews — the viewer's single star plus the optional tasting
 *    note it expands into, over the recipe's aggregate breakdown.
 * 2. Conversation — threaded comments and suggestions, which never require or
 *    display a star rating.
 *
 * Everything is fetched in parallel behind this section's own <Suspense>
 * boundary so the tab streams in independently of the recipe body.
 */
export async function RecipeDiscussionSection({
  recipeId,
  recipeSlug,
  viewer,
  currentUserId,
  isRecipeOwner,
  canInteract,
}: {
  recipeId: string;
  recipeSlug: string;
  viewer: User | null;
  currentUserId: string | null;
  isRecipeOwner: boolean;
  canInteract: boolean;
}) {
  const hiddenAuthorIds = await getHiddenAuthorIds(currentUserId);
  const [viewerRating, breakdown, comments, mentionCandidates, reviews, viewerReview] =
    await Promise.all([
      getViewerRating(recipeId, currentUserId),
      getRatingBreakdown(recipeId, viewer),
      getRecipeComments(recipeId, { hiddenAuthorIds }),
      getMentionCandidates(recipeId, currentUserId),
      listReviews(recipeId, 'recent', hiddenAuthorIds),
      getViewerReview(recipeId, currentUserId),
    ]);

  // Reaction tallies for every comment (all thread depths) and every review, in
  // one query each (#342).
  const [commentReactions, reviewReactions] = await Promise.all([
    getReactionsForTargets('comment', collectCommentIds(comments), currentUserId, hiddenAuthorIds),
    getReactionsForTargets(
      'review',
      reviews.map((review) => review.id),
      currentUserId,
      hiddenAuthorIds,
    ),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <RatingsReviewsSection
        recipeId={recipeId}
        recipeSlug={recipeSlug}
        breakdown={breakdown}
        viewerRating={viewerRating}
        viewerReview={
          viewerReview
            ? {
                id: viewerReview.id,
                rating: viewerReview.rating,
                title: viewerReview.title,
                body: viewerReview.body,
                photoUrl: viewerReview.photoUrl,
              }
            : null
        }
        initialReviews={reviews}
        reactionsByReview={Object.fromEntries(reviewReactions)}
        currentUserId={currentUserId}
        isRecipeOwner={isRecipeOwner}
        canReview={canInteract}
        // A recipe author can leave a tasting note on their own recipe, but a
        // self-rating is excluded from every aggregate, so never offer them a
        // star action that would fail with SELF_RATING.
        canRate={canInteract && !isRecipeOwner}
      />
      <CommentsSection
        recipeId={recipeId}
        recipeSlug={recipeSlug}
        initialComments={comments}
        currentUserId={currentUserId}
        isRecipeOwner={isRecipeOwner}
        canPost={canInteract}
        mentionCandidates={mentionCandidates}
        reactionsByComment={Object.fromEntries(commentReactions)}
      />
    </div>
  );
}
