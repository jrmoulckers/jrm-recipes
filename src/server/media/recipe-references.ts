export type RecipeMediaSnapshot = {
  coverImageUrl?: string | null;
  sourceImages?: { imageUrl?: string | null }[];
  steps?: {
    imageUrl?: string | null;
    videoUrl?: string | null;
    captionUrl?: string | null;
  }[];
};

/** All media references retained by one immutable recipe version. */
export function recipeSnapshotMediaUrls(snapshot: RecipeMediaSnapshot): string[] {
  return [
    snapshot.coverImageUrl,
    ...(snapshot.sourceImages ?? []).map((image) => image.imageUrl),
    ...(snapshot.steps ?? []).flatMap((step) => [step.imageUrl, step.videoUrl, step.captionUrl]),
  ].filter((url): url is string => typeof url === 'string' && url.length > 0);
}
