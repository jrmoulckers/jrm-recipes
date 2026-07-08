/**
 * Best-effort "safe for this person" matching (issues #405/#431). Given one
 * family member's stored needs (allergens to avoid + diets they follow) and a
 * recipe's dietary facts (detected allergens + self-declared diet flags),
 * decide whether the recipe is safe to show them.
 *
 * Pure and dependency-light so it can run on the server (browse filter) and the
 * client (card badge) alike, and be exhaustively unit-tested. Matching is
 * deliberately conservative: a recipe must *declare* it meets every diet the
 * member follows, and must carry *none* of their allergens. It can't see brand
 * formulations, so callers always pair it with a "double-check" disclaimer.
 */

import { type Allergen } from "./allergens";
import { type DietaryTag } from "./substitutions";

/** A family member's combined restrictions. */
export type MemberNeeds = {
  allergens: Allergen[];
  diets: DietaryTag[];
};

/** A recipe's dietary facts: detected allergens + self-declared diet flags. */
export type RecipeDietary = {
  allergens: Allergen[];
  dietaryFlags: DietaryTag[];
};

/** True when the recipe carries any allergen the member must avoid. */
export function hasAllergenConflict(
  memberAllergens: readonly Allergen[],
  recipeAllergens: readonly Allergen[],
): boolean {
  if (memberAllergens.length === 0) return false;
  const avoid = new Set<Allergen>(memberAllergens);
  return recipeAllergens.some((a) => avoid.has(a));
}

/**
 * True when the recipe declares every diet the member follows. A member with no
 * diet requirements is trivially satisfied; a recipe that hasn't declared its
 * flags can't satisfy a requirement, so it fails closed.
 */
export function meetsDiets(
  memberDiets: readonly DietaryTag[],
  recipeFlags: readonly DietaryTag[],
): boolean {
  if (memberDiets.length === 0) return true;
  const declared = new Set<DietaryTag>(recipeFlags);
  return memberDiets.every((d) => declared.has(d));
}

/**
 * Best-effort verdict: safe when the recipe trips none of the member's
 * allergens and declares every diet they follow.
 */
export function isRecipeSafeFor(
  member: MemberNeeds,
  recipe: RecipeDietary,
): boolean {
  return (
    !hasAllergenConflict(member.allergens, recipe.allergens) &&
    meetsDiets(member.diets, recipe.dietaryFlags)
  );
}
