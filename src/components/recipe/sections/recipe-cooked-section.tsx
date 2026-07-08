import { isDbConfigured } from "~/server/db";
import { getCookCount, getRecipeCookLog } from "~/server/cooklog/queries";
import { getReactionsForTargets } from "~/server/engagement/reactions";
import { CookLogSection } from "~/components/cooklog/cook-log-section";

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
  const [entries, cookCount] = await Promise.all([
    getRecipeCookLog(recipeId, userId),
    getCookCount(recipeId, userId),
  ]);

  // Reaction tallies for every cook-log entry in one query (#342).
  const reactionMap = await getReactionsForTargets(
    "cook_log",
    entries.map((entry) => entry.id),
    userId,
  );
  const reactionsByEntry = Object.fromEntries(reactionMap);

  return (
    <div className="mx-auto max-w-3xl">
      <CookLogSection
        recipeId={recipeId}
        recipeSlug={recipeSlug}
        recipeTitle={recipeTitle}
        entries={entries}
        cookCount={cookCount}
        canLog={canLog}
        canReact={Boolean(userId)}
        reactionsByEntry={reactionsByEntry}
        dbConfigured={isDbConfigured()}
      />
    </div>
  );
}
