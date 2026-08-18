import 'server-only';

import { and, desc, eq, inArray, lte } from 'drizzle-orm';

import {
  selectEffectiveTarget,
  sanitizeTargets,
  toIsoDate,
  type EffectiveNutritionTarget,
} from '~/lib/nutrition-targets';
import { db, isDbConfigured } from '~/server/db';
import { memberDietaryProfiles, nutritionTargets } from '~/server/db/schema';

/**
 * The read side of macro targets (issue #1046) — **the** way to ask "what was
 * this member aiming for on this day?".
 *
 * Retrospective surfaces (planner roll-ups, cook-log totals, adherence over
 * time) must score a day against the target that was in force *that day*, not
 * against whatever the member is aiming for now. Reading
 * `memberDietaryProfiles.calorieGoal` gets the latter and is wrong for anything
 * historical; that column survives only for the expand/contract window and is
 * dual-written from these rows.
 *
 * Every function is non-throwing and degrades to "no target" when the database
 * is not configured, so a caller can fold the result into a view without
 * guarding.
 */

type TargetRow = {
  id: string;
  profileId: string;
  effectiveFrom: string;
  targets: unknown;
};

function toEffective(row: TargetRow): EffectiveNutritionTarget {
  return {
    id: row.id,
    profileId: row.profileId,
    effectiveFrom: toIsoDate(row.effectiveFrom),
    targets: sanitizeTargets(row.targets),
  };
}

/** Owner scoping, when the caller wants the read to enforce it. */
export type TargetScope = { userId?: string };

function ownerFilter(scope?: TargetScope) {
  return scope?.userId ? eq(memberDietaryProfiles.userId, scope.userId) : undefined;
}

/**
 * The nutrition target in force for `profileId` on `date` — the newest row
 * whose `effectiveFrom` is on or before it — or `null` when the member had set
 * nothing by then.
 *
 * `date` accepts a `Date` or a `YYYY-MM-DD` string; a `Date` is read in local
 * time, so "today" means the member's today rather than UTC's.
 *
 * Pass `{ userId }` to have the read enforce ownership. Callers that have
 * already authorized the profile may omit it.
 */
export async function getNutritionTargetOn(
  profileId: string,
  date: Date | string,
  scope?: TargetScope,
): Promise<EffectiveNutritionTarget | null> {
  if (!isDbConfigured()) return null;
  const on = toIsoDate(date);

  const rows = await db
    .select({
      id: nutritionTargets.id,
      profileId: nutritionTargets.profileId,
      effectiveFrom: nutritionTargets.effectiveFrom,
      targets: nutritionTargets.targets,
    })
    .from(nutritionTargets)
    .innerJoin(memberDietaryProfiles, eq(memberDietaryProfiles.id, nutritionTargets.profileId))
    .where(
      and(
        eq(nutritionTargets.profileId, profileId),
        lte(nutritionTargets.effectiveFrom, on),
        ownerFilter(scope),
      ),
    )
    .orderBy(desc(nutritionTargets.effectiveFrom))
    .limit(1);

  const row = rows[0];
  return row ? toEffective(row) : null;
}

/**
 * {@link getNutritionTargetOn} for many members at once, keyed by profile id.
 * Every requested profile appears in the map, with `null` where no target
 * applied, so a caller can render a row per member without a second lookup.
 *
 * One query: candidate rows are narrowed by date in the database and reduced
 * per profile in memory, which is a handful of rows per family member.
 */
export async function getNutritionTargetsOn(
  profileIds: readonly string[],
  date: Date | string,
  scope?: TargetScope,
): Promise<Map<string, EffectiveNutritionTarget | null>> {
  const out = new Map<string, EffectiveNutritionTarget | null>(profileIds.map((id) => [id, null]));
  if (!isDbConfigured() || profileIds.length === 0) return out;
  const on = toIsoDate(date);

  const rows = await db
    .select({
      id: nutritionTargets.id,
      profileId: nutritionTargets.profileId,
      effectiveFrom: nutritionTargets.effectiveFrom,
      targets: nutritionTargets.targets,
    })
    .from(nutritionTargets)
    .innerJoin(memberDietaryProfiles, eq(memberDietaryProfiles.id, nutritionTargets.profileId))
    .where(
      and(
        inArray(nutritionTargets.profileId, [...profileIds]),
        lte(nutritionTargets.effectiveFrom, on),
        ownerFilter(scope),
      ),
    );

  const byProfile = new Map<string, TargetRow[]>();
  for (const row of rows) {
    const list = byProfile.get(row.profileId);
    if (list) list.push(row);
    else byProfile.set(row.profileId, [row]);
  }

  for (const id of profileIds) {
    const best = selectEffectiveTarget(byProfile.get(id) ?? [], on);
    out.set(id, best ? toEffective(best) : null);
  }
  return out;
}

/**
 * A member's full target history, newest first — the editing surface's view.
 * Scoring a date must go through {@link getNutritionTargetOn} rather than
 * re-implementing the "newest on or before" rule at the call site.
 */
export async function listNutritionTargets(
  profileId: string,
  scope?: TargetScope,
): Promise<EffectiveNutritionTarget[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .select({
      id: nutritionTargets.id,
      profileId: nutritionTargets.profileId,
      effectiveFrom: nutritionTargets.effectiveFrom,
      targets: nutritionTargets.targets,
    })
    .from(nutritionTargets)
    .innerJoin(memberDietaryProfiles, eq(memberDietaryProfiles.id, nutritionTargets.profileId))
    .where(and(eq(nutritionTargets.profileId, profileId), ownerFilter(scope)))
    .orderBy(desc(nutritionTargets.effectiveFrom));
  return rows.map(toEffective);
}

/**
 * Every target row a user owns, grouped by profile and newest first. Lets the
 * settings page load one query instead of one per family member.
 */
export async function listNutritionTargetsForUser(
  userId: string,
): Promise<Map<string, EffectiveNutritionTarget[]>> {
  const out = new Map<string, EffectiveNutritionTarget[]>();
  if (!isDbConfigured()) return out;

  const rows = await db
    .select({
      id: nutritionTargets.id,
      profileId: nutritionTargets.profileId,
      effectiveFrom: nutritionTargets.effectiveFrom,
      targets: nutritionTargets.targets,
    })
    .from(nutritionTargets)
    .innerJoin(memberDietaryProfiles, eq(memberDietaryProfiles.id, nutritionTargets.profileId))
    .where(eq(memberDietaryProfiles.userId, userId))
    .orderBy(desc(nutritionTargets.effectiveFrom));

  for (const row of rows) {
    const list = out.get(row.profileId);
    if (list) list.push(toEffective(row));
    else out.set(row.profileId, [toEffective(row)]);
  }
  return out;
}
