import { isDbConfigured } from "~/server/db";
import { getCookCount, getRecipeCookLog } from "~/server/cooklog/queries";
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

  return (
    <div className="mx-auto max-w-3xl">
      <CookLogSection
        recipeId={recipeId}
        recipeSlug={recipeSlug}
        recipeTitle={recipeTitle}
        entries={entries}
        cookCount={cookCount}
        canLog={canLog}
        dbConfigured={isDbConfigured()}
      />
    </div>
  );
}
