/**
 * Historical nutrition adherence, kept pure so planner and journal use the
 * same target-boundary and confidence rules.
 */

import {
  averageRollUp,
  rollUpNutritionViews,
  type NutritionRollUp,
  type RollUpItem,
} from './nutrition-rollup';
import {
  compareToTargets,
  hasTargets,
  type EffectiveNutritionTarget,
  type TargetComparison,
} from './nutrition-targets';

export type DatedRollUpItem = RollUpItem & {
  /** `YYYY-MM-DD`, in the same local-date convention as target effective dates. */
  date: string;
};

export type NutritionAdherenceMember = {
  id: string;
  name: string;
};

export type NutritionAdherenceSegment = {
  startDate: string;
  endDate: string;
  dayCount: number;
  target: EffectiveNutritionTarget | null;
  /** Intake evidence for only the dates in this target regime. */
  rollUp: NutritionRollUp;
  /** Daily-average intake scored against the daily target in force. */
  comparisons: TargetComparison[];
};

export type MemberNutritionAdherence = {
  profileId: string;
  name: string;
  segments: NutritionAdherenceSegment[];
};

export type NutritionTargetsByProfileAndDate = Map<
  string,
  Map<string, EffectiveNutritionTarget | null>
>;

type PendingSegment = {
  dates: string[];
  target: EffectiveNutritionTarget | null;
  items: DatedRollUpItem[];
};

function sameRegime(
  left: EffectiveNutritionTarget | null,
  right: EffectiveNutritionTarget | null,
): boolean {
  return left?.id === right?.id;
}

function finishSegment(segment: PendingSegment): NutritionAdherenceSegment {
  const rollUp = rollUpNutritionViews(segment.items);
  const dailyAverage = averageRollUp(rollUp.total, segment.dates.length);
  return {
    startDate: segment.dates[0]!,
    endDate: segment.dates.at(-1)!,
    dayCount: segment.dates.length,
    target: segment.target,
    rollUp,
    comparisons:
      segment.target && hasTargets(segment.target.targets)
        ? compareToTargets(dailyAverage, segment.target.targets)
        : [],
  };
}

/**
 * Split displayed dates at target changes and score each segment independently.
 *
 * `periodDates` includes dates with no meal (all seven planner days), preventing
 * an empty day at the boundary from making the earlier target leak forward.
 * Journal callers pass the distinct logged dates shown because that surface is
 * not a continuous calendar.
 */
export function buildNutritionAdherence(
  items: readonly DatedRollUpItem[],
  periodDates: readonly string[],
  members: readonly NutritionAdherenceMember[],
  targetsByProfileAndDate: NutritionTargetsByProfileAndDate,
): MemberNutritionAdherence[] {
  const dates = [...new Set([...periodDates, ...items.map((item) => item.date)])].sort();
  if (dates.length === 0)
    return members.map((member) => ({
      profileId: member.id,
      name: member.name,
      segments: [],
    }));

  const itemsByDate = new Map<string, DatedRollUpItem[]>();
  for (const item of items) {
    const list = itemsByDate.get(item.date);
    if (list) list.push(item);
    else itemsByDate.set(item.date, [item]);
  }

  return members.map((member) => {
    const targetsByDate = targetsByProfileAndDate.get(member.id) ?? new Map();
    const segments: NutritionAdherenceSegment[] = [];
    let pending: PendingSegment | null = null;

    for (const date of dates) {
      const target = targetsByDate.get(date) ?? null;
      if (!pending || !sameRegime(pending.target, target)) {
        if (pending) segments.push(finishSegment(pending));
        pending = { dates: [], target, items: [] };
      }
      pending.dates.push(date);
      pending.items.push(...(itemsByDate.get(date) ?? []));
    }

    if (pending) segments.push(finishSegment(pending));
    return { profileId: member.id, name: member.name, segments };
  });
}
