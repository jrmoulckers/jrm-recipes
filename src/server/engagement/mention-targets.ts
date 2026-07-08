import "server-only";

import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { groupMembers, recipes } from "~/server/db/schema";
import type { MentionCandidate } from "~/lib/mentions";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

const USER_COLS = {
  id: true,
  name: true,
  handle: true,
  avatarUrl: true,
} as const;

/**
 * The set of members who can be @mentioned on a recipe (issue #340): the recipe
 * author plus everyone in the recipe's group. De-duped by user id. Accepts a db
 * handle or a transaction so both the composer (read) and `createComment`
 * (inside its write tx) share one definition of "who is mentionable".
 */
export async function loadMentionCandidates(
  exec: Exec,
  recipeId: string,
): Promise<MentionCandidate[]> {
  const recipe = await exec.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: { id: true, groupId: true },
    with: { author: { columns: USER_COLS } },
  });
  if (!recipe) return [];

  const byId = new Map<string, MentionCandidate>();
  if (recipe.author) byId.set(recipe.author.id, recipe.author);

  if (recipe.groupId) {
    const members = await exec.query.groupMembers.findMany({
      where: eq(groupMembers.groupId, recipe.groupId),
      with: { user: { columns: USER_COLS } },
    });
    for (const m of members) {
      if (m.user) byId.set(m.user.id, m.user);
    }
  }

  return [...byId.values()];
}
