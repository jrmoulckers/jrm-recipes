import {
  getMentionCandidates,
  getRatingBreakdown,
  getRecipeComments,
  getViewerRating,
} from "~/server/engagement/queries";
import { getReactionsForTargets } from "~/server/engagement/reactions";
import { getHiddenAuthorIds } from "~/server/moderation/blocks";
import type { ThreadedComment } from "~/server/engagement/queries";
import type { User } from "~/server/db/schema";
import { RatingControl } from "~/components/engagement/rating-control";
import { RatingSummary } from "~/components/engagement/rating-summary";
import { CommentsSection } from "~/components/engagement/comments-section-lazy";

/** Flatten a threaded comment tree into a flat list of ids (all depths). */
function collectCommentIds(nodes: ThreadedComment[], into: string[] = []): string[] {
  for (const node of nodes) {
    into.push(node.id);
    if (node.replies.length > 0) collectCommentIds(node.replies, into);
  }
  return into;
}

/**
 * Discussion tab content (#176): rating + threaded comments. Fetches the
 * viewer's rating and the comment tree in parallel so it streams in behind its
 * own <Suspense> boundary. The aggregate summary comes from the already-loaded
 * recipe, so it's passed in rather than re-derived.
 */
export async function RecipeDiscussionSection({
  recipeId,
  recipeSlug,
  summary,
  viewer,
  currentUserId,
  isRecipeOwner,
  canInteract,
}: {
  recipeId: string;
  recipeSlug: string;
  summary: { average: number; count: number };
  viewer: User | null;
  currentUserId: string | null;
  isRecipeOwner: boolean;
  canInteract: boolean;
}) {
  const hiddenAuthorIds = await getHiddenAuthorIds(currentUserId);
  const [viewerRating, breakdown, comments, mentionCandidates] =
    await Promise.all([
      getViewerRating(recipeId, currentUserId),
      getRatingBreakdown(recipeId, viewer),
      getRecipeComments(recipeId, { hiddenAuthorIds }),
      getMentionCandidates(recipeId, currentUserId),
    ]);

  // Reaction tallies for every comment (all thread depths) in one query (#342).
  const reactionMap = await getReactionsForTargets(
    "comment",
    collectCommentIds(comments),
    currentUserId,
    hiddenAuthorIds,
  );
  const reactionsByComment = Object.fromEntries(reactionMap);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <RatingControl
        recipeId={recipeId}
        recipeSlug={recipeSlug}
        summary={summary}
        viewerRating={viewerRating}
        canRate={canInteract}
      />
      <RatingSummary breakdown={breakdown} />
      <CommentsSection
        recipeId={recipeId}
        recipeSlug={recipeSlug}
        initialComments={comments}
        currentUserId={currentUserId}
        isRecipeOwner={isRecipeOwner}
        canPost={canInteract}
        mentionCandidates={mentionCandidates}
        reactionsByComment={reactionsByComment}
      />
    </div>
  );
}
