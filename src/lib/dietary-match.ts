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

import { detectAllergensForSafety, type Allergen } from "./allergens";
import { type DietaryTag, type Substitution } from "./substitutions";

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

/**
 * A selectable family member for the client "cooking/shopping for" controls:
 * enough to label the selection and check allergens. Diets are optional because
 * some surfaces (shopping list, planner) only warn on detectable allergens.
 */
export type ActiveMemberOption = {
  id: string;
  name: string;
  allergens: Allergen[];
};

/** True when the recipe carries any allergen the member must avoid. */
export function hasAllergenConflict(
  memberAllergens: readonly Allergen[],
  recipeAllergens: readonly Allergen[],
): boolean {
  return allergenConflicts(memberAllergens, recipeAllergens).length > 0;
}

/**
 * The member allergens a recipe actually carries, in the member's own order.
 * Powers the recipe-card badge (#431): an empty list reads as "looks safe for
 * <name>", a non-empty one names the conflicts ("Contains dairy"). Detection is
 * text-based and best-effort, so callers pair it with a "double-check" tooltip.
 */
export function allergenConflicts(
  memberAllergens: readonly Allergen[],
  recipeAllergens: readonly Allergen[],
): Allergen[] {
  if (memberAllergens.length === 0) return [];
  const present = new Set<Allergen>(recipeAllergens);
  return memberAllergens.filter((a) => present.has(a));
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

/**
 * The allergens each diet forbids *and that the allergen knowledge base can
 * detect from ingredient text*. Diets also forbid things the KB can't see
 * (vegan/vegetarian exclude meat; vegan excludes honey), so ingredient-level
 * flagging is necessarily best-effort — the "double-check" disclaimer covers
 * the gaps.
 */
export const DIET_FORBIDDEN_ALLERGENS: Record<DietaryTag, Allergen[]> = {
  vegan: ["dairy", "egg", "fish", "shellfish"],
  vegetarian: ["fish", "shellfish"],
  "dairy-free": ["dairy"],
  "gluten-free": ["wheat"],
  "egg-free": ["egg"],
  "nut-free": ["peanut", "tree-nut"],
  "soy-free": ["soy"],
  "shellfish-free": ["shellfish"],
  "fish-free": ["fish"],
  "sesame-free": ["sesame"],
};

/**
 * The "-free" diet tag that neutralizes a given allergen, where one exists.
 * Used to pre-filter the substitutions popover toward a safe swap when the
 * conflict is a raw allergen rather than a declared diet.
 */
const ALLERGEN_TO_DIET: Partial<Record<Allergen, DietaryTag>> = {
  dairy: "dairy-free",
  egg: "egg-free",
  wheat: "gluten-free",
};

/** A single ingredient's conflict with the active member's restrictions. */
export type IngredientConflict = {
  /** Member allergens this ingredient carries. */
  allergens: Allergen[];
  /** Member diets this ingredient violates. */
  diets: DietaryTag[];
  /** Dietary tags to pre-filter the swap popover toward a safe option. */
  suggestedTags: DietaryTag[];
};

/**
 * Cross-reference one ingredient's detected allergens against a member's needs
 * (issue #429). Reuses the allergen knowledge base (caller passes the result of
 * `detectAllergens`) — no second knowledge base — and returns which allergens
 * and diets it trips plus the dietary tags that would surface a safe swap.
 */
export function detectIngredientConflict(
  itemAllergens: readonly Allergen[],
  member: MemberNeeds,
): IngredientConflict {
  const carried = new Set<Allergen>(itemAllergens);
  const allergens = member.allergens.filter((a) => carried.has(a));
  const diets = member.diets.filter((d) =>
    DIET_FORBIDDEN_ALLERGENS[d].some((a) => carried.has(a)),
  );
  const suggested = new Set<DietaryTag>(diets);
  for (const a of allergens) {
    const tag = ALLERGEN_TO_DIET[a];
    if (tag) suggested.add(tag);
  }
  return { allergens, diets, suggestedTags: [...suggested] };
}

/** True when an ingredient trips any of the member's allergens or diets. */
export function isIngredientConflict(conflict: IngredientConflict): boolean {
  return conflict.allergens.length > 0 || conflict.diets.length > 0;
}

/**
 * A proactive meal-plan safety warning (allergen/diet gating): one family member
 * whose profile conflicts with a planned recipe, naming the specific allergens
 * the recipe carries and the diets its allergens violate. Surfaced at add-time —
 * it never blocks the action, it just flags the conflict.
 */
export type PlanSafetyWarning = {
  memberId: string;
  memberName: string;
  /** The member's own allergens the recipe carries. */
  allergens: Allergen[];
  /** The member's diets the recipe's allergens violate (e.g. vegan vs dairy). */
  diets: DietaryTag[];
};

/** A saved member profile, narrowed to what plan gating needs. */
export type PlanMember = {
  id: string;
  name: string;
  allergens: readonly Allergen[];
  diets: readonly DietaryTag[];
};

/**
 * Cross-check one recipe's (structured) allergens against every saved family
 * member and return a warning per member that conflicts. Allergen conflicts are
 * the member's avoided allergens the recipe carries; diet conflicts are the
 * member's diets whose forbidden allergens the recipe carries (so "vegan" trips
 * on dairy/egg/fish/shellfish). Members with no conflict are omitted. Pure, so
 * it runs on the write path and in unit tests.
 */
export function memberPlanWarnings(
  recipeAllergens: readonly Allergen[],
  members: readonly PlanMember[],
): PlanSafetyWarning[] {
  if (recipeAllergens.length === 0) return [];
  const present = new Set<Allergen>(recipeAllergens);
  const warnings: PlanSafetyWarning[] = [];
  for (const member of members) {
    const allergens = member.allergens.filter((a) => present.has(a));
    const diets = member.diets.filter((d) =>
      DIET_FORBIDDEN_ALLERGENS[d].some((a) => present.has(a)),
    );
    if (allergens.length > 0 || diets.length > 0) {
      warnings.push({
        memberId: member.id,
        memberName: member.name,
        allergens,
        diets,
      });
    }
  }
  return warnings;
}

/**
 * Filter a candidate swap list down to those that are actually safe for a
 * member's FULL allergen set (issue #429 safety fix). A swap surfaced under
 * "safe swaps for {name}" must never introduce *another* of the member's
 * allergens — e.g. a dairy swap of "cashew cream" is unsafe for someone who is
 * also allergic to tree nuts, and an "almond milk" swap is unsafe for a nut
 * allergy. Runs the same best-effort detector (direct + hidden) over each
 * swap's name and notes and drops any that carries an avoided allergen. An
 * empty `avoidAllergens` (no active member, or no recorded allergies) leaves
 * the list untouched.
 */
export function safeSubstitutions(
  subs: readonly Substitution[],
  avoidAllergens: readonly Allergen[],
): Substitution[] {
  if (avoidAllergens.length === 0) return [...subs];
  const avoid = new Set<Allergen>(avoidAllergens);
  return subs.filter((sub) => {
    const carried = detectAllergensForSafety(
      `${sub.substitute} ${sub.ratioOrNotes}`,
    );
    return !carried.some((allergen) => avoid.has(allergen));
  });
}
