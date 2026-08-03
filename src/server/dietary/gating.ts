import "server-only";

import { eq } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { memberDietaryProfiles } from "~/server/db/schema";
import { isAllergen } from "~/lib/allergens";
import { isDietaryTag } from "~/lib/substitutions";
import {
  memberPlanWarnings,
  type PlanMember,
  type PlanSafetyWarning,
} from "~/lib/dietary-match";
import { getRecipeAllergensBatch } from "~/server/recipes/allergens";

export type { PlanSafetyWarning } from "~/lib/dietary-match";

/**
 * Proactive allergen/diet gating for planned meals. Cross-checks the given
 * recipes' STRUCTURED allergens (food graph, with text fallback) against every
 * dietary profile the cook manages and returns the per-recipe conflicts (member
 * + allergen/diet). This is advisory only. Callers surface it as an add-time
 * warning and never block the plan or shopping action on it.
 *
 * Best-effort by contract: it never throws. Any failure (DB off, query error)
 * resolves to no warnings so a plan action is never blocked by gating.
 */
export async function planWarningsForRecipes(
  userId: string,
  recipeIds: readonly string[],
): Promise<Map<string, PlanSafetyWarning[]>> {
  const result = new Map<string, PlanSafetyWarning[]>();
  const ids = [...new Set(recipeIds)];
  if (ids.length === 0 || !isDbConfigured()) return result;

  try {
    const profiles = await db.query.memberDietaryProfiles.findMany({
      where: eq(memberDietaryProfiles.userId, userId),
      columns: { id: true, name: true, allergens: true, diets: true },
    });

    const members: PlanMember[] = profiles
      .map((profile) => ({
        id: profile.id,
        name: profile.name,
        allergens: (profile.allergens ?? []).filter(isAllergen),
        diets: (profile.diets ?? []).filter(isDietaryTag),
      }))
      .filter((m) => m.allergens.length > 0 || m.diets.length > 0);

    if (members.length === 0) return result;

    const allergensByRecipe = await getRecipeAllergensBatch(ids);
    for (const id of ids) {
      const warnings = memberPlanWarnings(
        allergensByRecipe.get(id) ?? [],
        members,
      );
      if (warnings.length > 0) result.set(id, warnings);
    }
    return result;
  } catch {
    // Gating must never block a plan/shopping action.
    return new Map();
  }
}

/** Warnings for a single recipe (see {@link planWarningsForRecipes}). */
export async function planWarningsForRecipe(
  userId: string,
  recipeId: string,
): Promise<PlanSafetyWarning[]> {
  const map = await planWarningsForRecipes(userId, [recipeId]);
  return map.get(recipeId) ?? [];
}
