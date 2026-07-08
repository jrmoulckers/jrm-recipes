import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, varchar } from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { groups } from "./groups";

/**
 * Per-family-member dietary profiles (issue #396). A cook records each person
 * they cook for once — their allergens, the diets they follow, and an optional
 * daily calorie goal — so downstream "safe for" features can check recipes
 * against real restrictions instead of the cook holding it all in their head.
 *
 * `allergens` stores canonical {@link Allergen} strings and `diets` stores
 * canonical `DietaryTag` strings; validation guarantees no drift from the
 * shared unions. A profile is owned by a user and optionally scoped to a group
 * (e.g. one household), so it can be shared with the right family table.
 */
export const memberDietaryProfiles = pgTable(
  "member_dietary_profiles",
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Optional household scope. If the group is deleted the profile survives as
    // a personal (unscoped) profile rather than vanishing.
    groupId: fk().references(() => groups.id, { onDelete: "set null" }),
    name: varchar({ length: 80 }).notNull(),
    allergens: text().array(),
    diets: text().array(),
    calorieGoal: integer(),
    ...timestamps(),
  },
  (t) => [
    index("member_dietary_profiles_user_idx").on(t.userId),
    index("member_dietary_profiles_group_idx").on(t.groupId),
  ],
);

export const memberDietaryProfilesRelations = relations(
  memberDietaryProfiles,
  ({ one }) => ({
    owner: one(users, {
      fields: [memberDietaryProfiles.userId],
      references: [users.id],
    }),
    group: one(groups, {
      fields: [memberDietaryProfiles.groupId],
      references: [groups.id],
    }),
  }),
);

export type MemberDietaryProfile = typeof memberDietaryProfiles.$inferSelect;
export type NewMemberDietaryProfile = typeof memberDietaryProfiles.$inferInsert;
