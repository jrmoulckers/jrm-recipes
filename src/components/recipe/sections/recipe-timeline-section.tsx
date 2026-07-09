import { History } from "lucide-react";

import { getRecipeTimeline, getRecipeVersions } from "~/server/recipes/queries";
import { type RecipeForViewer } from "~/server/recipes/loaders";
import { RecipeStory } from "~/components/recipe/story";
import { RecipeTimeline } from "~/components/recipe/timeline";
import { VersionCompare } from "~/components/recipe/version-compare";

/**
 * Timeline tab content (#176). Fetches the story timeline and saved versions in
 * parallel so it can stream in behind its own <Suspense> boundary without
 * blocking the recipe's above-the-fold shell.
 */
export async function RecipeTimelineSection({
  recipeId,
  recipeSlug,
  recipeTitle,
  canRevert,
  user,
}: {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  canRevert: boolean;
  user: RecipeForViewer["user"];
}) {
  const [timeline, versions] = await Promise.all([
    getRecipeTimeline(recipeId, user),
    getRecipeVersions(recipeId),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <RecipeStory entries={timeline.entries} recipeTitle={recipeTitle} />
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <History className="size-4" aria-hidden="true" />
          Saved versions
        </div>
        <RecipeTimeline
          versions={versions.items}
          recipeSlug={recipeSlug}
          recipeId={recipeId}
          canRevert={canRevert}
        />
        <VersionCompare
          recipeId={recipeId}
          versions={versions.items.map((version) => ({
            versionNumber: version.versionNumber,
            label:
              version.label ??
              (version.versionNumber === 1 ? "Created" : "Updated"),
          }))}
        />
      </div>
    </div>
  );
}
