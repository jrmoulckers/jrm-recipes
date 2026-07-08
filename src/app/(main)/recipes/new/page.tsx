import { type Metadata } from "next";

import { getCurrentUser } from "~/server/auth";
import { getLimitStatus } from "~/server/billing/entitlements";
import { listUserGroups } from "~/server/recipes/queries";
import { RecipeEditor } from "~/components/recipe/recipe-editor";
import { safeSharedImageUrl } from "~/lib/share-target";
import { UsageLimitNotice } from "~/components/billing/usage-limit-notice";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ cover?: string }>;
}) {
  const { cover } = await searchParams;
  // Only a Cloudinary https URL we just uploaded (via the photo share target)
  // is trusted as a pre-filled cover; anything else is ignored.
  const initialCoverImageUrl = safeSharedImageUrl(cover);

  const user = await getCurrentUser();
  const groups = user ? await listUserGroups(user.id) : [];

  // Surface the recipe soft-limit (#318) before the editor: a gentle heads-up as
  // the free cap approaches, and a calm note once reached. Creating is still
  // possible in the editor — the create action returns the upgrade prompt — so
  // this never hard-blocks drafting.
  const limit = user
    ? await getLimitStatus(user, "maxRecipes", "recipes")
    : null;

  return (
    <>
      {limit && limit.limit !== null && limit.state !== "ok" ? (
        <div className="container pt-6">
          <UsageLimitNotice
            used={limit.used}
            limit={limit.limit}
            state={limit.state}
          />
        </div>
      ) : null}
      <RecipeEditor
        mode="create"
        groups={groups}
        initialCoverImageUrl={initialCoverImageUrl}
      />
    </>
  );
}
