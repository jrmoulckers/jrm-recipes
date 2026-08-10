/**
 * Human copy for proactive meal-plan safety warnings (allergen/diet gating).
 * Pure and client-safe so both the planner add dialog and the shopping
 * build-from-plan button can render the same "heads up" message. Warnings are
 * advisory. The wording flags the conflict without implying the action failed.
 */
import { ALLERGEN_LABELS } from './allergens';
import { DIETARY_TAG_LABELS } from './substitutions';
import { type PlanSafetyWarning } from './dietary-match';
import { formatList } from './i18n-format';

/** Aggregate warnings by member (union across recipes), preserving first-seen order. */
function byMember(warnings: readonly PlanSafetyWarning[]): PlanSafetyWarning[] {
  const map = new Map<string, PlanSafetyWarning>();
  for (const w of warnings) {
    const existing = map.get(w.memberId);
    if (existing) {
      existing.allergens = [...new Set([...existing.allergens, ...w.allergens])];
      existing.diets = [...new Set([...existing.diets, ...w.diets])];
    } else {
      map.set(w.memberId, {
        ...w,
        allergens: [...w.allergens],
        diets: [...w.diets],
      });
    }
  }
  return [...map.values()];
}

/**
 * A one-line, non-blocking summary of who a planned recipe (or week) conflicts
 * with, e.g. "Heads up: contains dairy (unsafe for Mom) and shellfish (unsafe
 * for Ben)." Returns `null` when there's nothing to warn about.
 */
export function formatPlanWarnings(
  warnings: readonly PlanSafetyWarning[],
  locale: string,
): string | null {
  const members = byMember(warnings);
  if (members.length === 0) return null;

  const clauses = members.map((m) => {
    const reasons = [
      ...m.allergens.map((a) => ALLERGEN_LABELS[a].toLowerCase()),
      ...m.diets.map((d) => `not ${DIETARY_TAG_LABELS[d].toLowerCase()}`),
    ];
    return `${formatList(reasons, locale)} (unsafe for ${m.memberName})`;
  });

  return `Heads up: ${formatList(clauses, locale)}. Added anyway. Double-check before serving.`;
}
