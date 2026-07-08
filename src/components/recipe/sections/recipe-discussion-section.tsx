import {
  getRecipeComments,
  getViewerRating,
} from "~/server/engagement/queries";
import { RatingControl } from "~/components/engagement/rating-control";
import { CommentsSection } from "~/components/engagement/comments-section";

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
  currentUserId,
  isRecipeOwner,
  canInteract,
}: {
  recipeId: string;
  recipeSlug: string;
  summary: { average: number; count: number };
  currentUserId: string | null;
  isRecipeOwner: boolean;
  canInteract: boolean;
}) {
  const [viewerRating, comments] = await Promise.all([
    getViewerRating(recipeId, currentUserId),
    getRecipeComments(recipeId),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <RatingControl
        recipeId={recipeId}
        recipeSlug={recipeSlug}
        summary={summary}
        viewerRating={viewerRating}
        canRate={canInteract}
      />
      <CommentsSection
        recipeId={recipeId}
        recipeSlug={recipeSlug}
        initialComments={comments}
        currentUserId={currentUserId}
        isRecipeOwner={isRecipeOwner}
        canPost={canInteract}
      />
    </div>
  );
}
