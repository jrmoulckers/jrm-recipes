"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { ALLERGEN_LABELS, type Allergen } from "~/lib/allergens";
import { allergenConflicts } from "~/lib/dietary-match";
import { useActiveMemberStore } from "~/lib/active-member-store";
import { formatList } from "~/lib/i18n-format";
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
  /**
   * The recipe's detected allergens (conservative direct+hidden union, rolled
   * up server-side). `null` means there was no structured ingredient data to
   * analyze — distinct from `[]` ("analyzed, none found") — so the reassuring
   * "safe" badge is withheld rather than claimed off missing data.
   */
  recipeAllergens: Allergen[] | null;
}) {
  const activeMemberId = useActiveMemberStore((s) => s.activeMemberId);
  const member = members.find((m) => m.id === activeMemberId);
  const locale = useLocale();

  // Only meaningful when the active member actually has allergies to check —
  // otherwise every card would wear a trivial "safe" chip.
  if (!member || member.allergens.length === 0) return null;

  // No ingredient data to analyze: never imply "safe" from an absence of
  // detections. Stay silent (the grid stays clean; no false reassurance).
  if (recipeAllergens === null) return null;

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
  const label = `Contains ${formatList(names, locale)}`;
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
