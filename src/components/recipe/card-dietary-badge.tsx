"use client";

import * as React from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { ALLERGEN_LABELS, type Allergen } from "~/lib/allergens";
import { allergenConflicts } from "~/lib/dietary-match";
import { useActiveMemberStore } from "~/lib/active-member-store";
import { Badge } from "~/components/ui/badge";

/** The active-member data a card needs to render its safe-for badge. */
export type CardDietaryMember = {
  id: string;
  name: string;
  allergens: Allergen[];
};

const DISCLAIMER =
  "Best-effort from ingredient text — always double-check labels and brands.";

/**
 * At-a-glance "safe for my family" signal on a recipe card (issue #431). When a
 * family member with recorded allergies is active, it cross-references the
 * recipe's detected allergens (rolled up server-side via `summarizeAllergens`)
 * against that member and shows a reassuring check or a caution chip naming the
 * conflict. Renders nothing when no such member is active, so grids stay clean
 * by default. Detection is text-based, so the label carries a best-effort
 * disclaimer.
 */
export function CardDietaryBadge({
  members,
  recipeAllergens,
}: {
  members: CardDietaryMember[];
  recipeAllergens: Allergen[];
}) {
  const activeMemberId = useActiveMemberStore((s) => s.activeMemberId);
  const member = members.find((m) => m.id === activeMemberId);

  // Only meaningful when the active member actually has allergies to check —
  // otherwise every card would wear a trivial "safe" chip.
  if (!member || member.allergens.length === 0) return null;

  const conflicts = allergenConflicts(member.allergens, recipeAllergens);

  if (conflicts.length === 0) {
    const label = `Looks safe for ${member.name}`;
    return (
      <Badge
        variant="success"
        className="w-fit gap-1"
        aria-label={`${label}. ${DISCLAIMER}`}
        title={DISCLAIMER}
      >
        <ShieldCheck className="size-3.5" aria-hidden />
        {label}
      </Badge>
    );
  }

  const names = conflicts.map((a) => ALLERGEN_LABELS[a].toLowerCase());
  const label = `Contains ${formatList(names)}`;
  return (
    <Badge
      variant="warning"
      className="w-fit gap-1"
      aria-label={`Not safe for ${member.name}: ${label}. ${DISCLAIMER}`}
      title={DISCLAIMER}
    >
      <AlertTriangle className="size-3.5" aria-hidden />
      {label}
    </Badge>
  );
}

/** Join labels into a natural "a, b and c" list. */
function formatList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
