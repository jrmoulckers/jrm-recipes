import { isDbConfigured } from "~/server/db";
import {
  getCookCount,
  getFamilyCooks,
  getRecipeCookLog,
  getShareableGroupForRecipe,
} from "~/server/cooklog/queries";
import { getReactionsForTargets } from "~/server/engagement/reactions";
import { getHiddenAuthorIds } from "~/server/moderation/blocks";
import { CookLogSection } from "~/components/cooklog/cook-log-section";
import { FamilyCooksStrip } from "~/components/cooklog/family-cooks-strip";

/**
 * "Cooked it" tab content (#176). Fetches the cook log and count in parallel so
 * it streams in behind its own <Suspense> boundary.
 */
export async function RecipeCookedSection({
  recipeId,
  recipeSlug,
  recipeTitle,
  userId,
  canLog,
}: {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  userId: string | null;
  canLog: boolean;
}) {
  const [entries, cookCount, shareGroup, familyCooks, hiddenAuthorIds] =
    await Promise.all([
      getRecipeCookLog(recipeId, userId),
      getCookCount(recipeId, userId),
      getShareableGroupForRecipe(recipeId, userId),
      getFamilyCooks(recipeId, userId),
      getHiddenAuthorIds(userId),
    ]);

  // Reaction tallies for every cook-log entry in one query (#342), with a
  // blocked member's reactions filtered out (#355).
  const reactionMap = await getReactionsForTargets(
    "cook_log",
    entries.map((entry) => entry.id),
    userId,
    hiddenAuthorIds,
  );
  const reactionsByEntry = Object.fromEntries(reactionMap);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <FamilyCooksStrip cooks={familyCooks} />
      <CookLogSection
        recipeId={recipeId}
        recipeSlug={recipeSlug}
        recipeTitle={recipeTitle}
        entries={entries}
        cookCount={cookCount}
        canLog={canLog}
        canReact={Boolean(userId)}
        reactionsByEntry={reactionsByEntry}
        shareGroup={shareGroup}
        dbConfigured={isDbConfigured()}
      />
    </div>
  );
}
