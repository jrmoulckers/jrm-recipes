import {
  getViewerReview,
  listReviews,
} from "~/server/engagement/reviews";
import { ReviewsSection } from "~/components/engagement/reviews-section";

/**
 * Reviews tab content (#341): the recipe's written reviews + the viewer's own
 * review (to prefill the composer). Fetched in parallel behind its own Suspense
 * boundary. Visually and structurally separate from the comments thread.
 */
export async function RecipeReviewsSection({
  recipeId,
  recipeSlug,
  currentUserId,
  isRecipeOwner,
  canInteract,
}: {
  recipeId: string;
  recipeSlug: string;
  currentUserId: string | null;
  isRecipeOwner: boolean;
  canInteract: boolean;
}) {
  const [reviews, viewerReview] = await Promise.all([
    listReviews(recipeId),
    getViewerReview(recipeId, currentUserId),
  ]);

  return (
    <ReviewsSection
      recipeId={recipeId}
      recipeSlug={recipeSlug}
      initialReviews={reviews}
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
      currentUserId={currentUserId}
      canReview={canInteract}
      isRecipeOwner={isRecipeOwner}
    />
  );
}
