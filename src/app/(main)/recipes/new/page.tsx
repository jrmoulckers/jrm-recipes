import { type Metadata } from "next";

import { getCurrentUser } from "~/server/auth";
import { listUserGroups } from "~/server/recipes/queries";
import { RecipeEditor } from "~/components/recipe/recipe-editor";
import { safeSharedImageUrl } from "~/lib/share-target";

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
  return (
    <RecipeEditor
      mode="create"
      groups={groups}
      initialCoverImageUrl={initialCoverImageUrl}
    />
  );
}
