import { type Metadata } from "next";

import { getCurrentUser } from "~/server/auth";
import { listUserGroups } from "~/server/recipes/queries";
import { RecipeEditor } from "~/components/recipe/recipe-editor";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewRecipePage() {
  const user = await getCurrentUser();
  const groups = user ? await listUserGroups(user.id) : [];
  return <RecipeEditor mode="create" groups={groups} />;
}
