import { relations } from 'drizzle-orm';
import { date, index, jsonb, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import type { Nutrition } from '~/lib/nutrition';

import { fk, pk, timestamps } from './_shared';
import { users } from './users';
import { groups } from './groups';

/**
 * Per-family-member dietary profiles (issue #396). A cook records each person
 * they cook for once. Their allergens and the diets they follow let downstream
 * "safe for" features check recipes against real restrictions instead of the
 * cook holding it all in their head.
 *
 * `allergens` stores canonical {@link Allergen} strings and `diets` stores
 * canonical `DietaryTag` strings. Validation guarantees no drift from the
 * shared unions. A profile is owned by a user and optionally scoped to a group
 * (e.g. one household), so it can be shared with the right family table.
 */
export const memberDietaryProfiles = pgTable(
  'member_dietary_profiles',
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Optional household scope. If the group is deleted the profile survives as
    // a personal (unscoped) profile rather than vanishing.
    groupId: fk().references(() => groups.id, { onDelete: 'set null' }),
    name: varchar({ length: 80 }).notNull(),
    allergens: text().array(),
    diets: text().array(),
    ...timestamps(),
  },
  (t) => [
    index('member_dietary_profiles_user_idx').on(t.userId),
    index('member_dietary_profiles_group_idx').on(t.groupId),
  ],
);

export const memberDietaryProfilesRelations = relations(memberDietaryProfiles, ({ one, many }) => ({
  owner: one(users, {
    fields: [memberDietaryProfiles.userId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [memberDietaryProfiles.groupId],
    references: [groups.id],
  }),
  nutritionTargets: many(nutritionTargets),
}));

/**
 * Versioned macro targets per family member (issue #1046).
 *
 * A target is a **fact with a history**, not a current setting. The row that
 * applies to a date is the one with the greatest `effectiveFrom` on or before
 * it, so a week cooked during a cut stays scored against the cut's numbers
 * after the member switches to a bulk. Storing one mutable goal per profile
 * silently rewrites every retrospective surface the moment the goal changes.
 *
 * `targets` is a partial map in the app's `Nutrition` key space rather than a
 * column per nutrient, following the same reasoning as the `food_nutrients`
 * vector (#1028): a fiber or sodium target is a registry row, not a migration.
 * **Partial by construction** — an absent key means the member set no target for
 * that nutrient, which is not the claim that their target is `0`.
 *
 * Uniqueness on `(profileId, effectiveFrom)` makes editing "the target that
 * started on 1 March" an upsert, so a member correcting today's numbers doesn't
 * accumulate same-day rows that the effective-date lookup would have to break
 * ties between.
 */
export const nutritionTargets = pgTable(
  'nutrition_targets',
  {
    id: pk(),
    profileId: fk()
      .notNull()
      .references(() => memberDietaryProfiles.id, { onDelete: 'cascade' }),
    /**
     * The date this target came into force, `YYYY-MM-DD` in the member's own
     * calendar. A plain date, not a timestamp: a target is a day-scoped fact and
     * a timezone-shifted midnight would move which week it scores.
     */
    effectiveFrom: date().notNull(),
    /** Daily targets keyed by `NutritionKey`. Absent key = no target set. */
    targets: jsonb().$type<Nutrition>().notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('nutrition_targets_profile_effective_uq').on(t.profileId, t.effectiveFrom),
    index('nutrition_targets_profile_idx').on(t.profileId),
  ],
);

export const nutritionTargetsRelations = relations(nutritionTargets, ({ one }) => ({
  profile: one(memberDietaryProfiles, {
    fields: [nutritionTargets.profileId],
    references: [memberDietaryProfiles.id],
  }),
}));

export type NutritionTargetRow = typeof nutritionTargets.$inferSelect;
export type NewNutritionTarget = typeof nutritionTargets.$inferInsert;

export type MemberDietaryProfile = typeof memberDietaryProfiles.$inferSelect;
export type NewMemberDietaryProfile = typeof memberDietaryProfiles.$inferInsert;
