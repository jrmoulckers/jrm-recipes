import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { recipes } from "./recipes";
import { groups } from "./groups";

/**
 * A scheduled "let's all cook this together" event for a family group
 * (issue #353). A host picks a recipe + time and invites the group; members
 * RSVP. `reminderSentAt` is stamped once the pre-event notification fires so a
 * reminder is never sent twice.
 */
export const cookAlongs = pgTable(
  "cook_alongs",
  {
    id: pk(),
    groupId: fk()
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    // Who scheduled it; nulls out if that user is removed so the event survives.
    hostId: fk().references(() => users.id, { onDelete: "set null" }),
    title: varchar({ length: 200 }),
    note: text(),
    scheduledFor: timestamp({ withTimezone: true }).notNull(),
    reminderSentAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // "Upcoming cook-alongs for this group" — the group-page read.
    index("cook_alongs_group_scheduled_idx").on(t.groupId, t.scheduledFor),
    index("cook_alongs_recipe_idx").on(t.recipeId),
    index("cook_alongs_host_idx").on(t.hostId),
  ],
);

/** How a member responded to a cook-along invite (issue #353). */
export const rsvpStatus = pgEnum("rsvp_status", ["going", "maybe", "declined"]);

/** A single member's RSVP to a cook-along. At most one per member per event. */
export const cookAlongRsvps = pgTable(
  "cook_along_rsvps",
  {
    id: pk(),
    cookAlongId: fk()
      .notNull()
      .references(() => cookAlongs.id, { onDelete: "cascade" }),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: rsvpStatus().notNull().default("going"),
    ...timestamps(),
  },
  (t) => [
    unique("cook_along_rsvps_event_user_uq").on(t.cookAlongId, t.userId),
    index("cook_along_rsvps_event_idx").on(t.cookAlongId),
    index("cook_along_rsvps_user_idx").on(t.userId),
  ],
);

export const cookAlongsRelations = relations(cookAlongs, ({ one, many }) => ({
  group: one(groups, {
    fields: [cookAlongs.groupId],
    references: [groups.id],
  }),
  recipe: one(recipes, {
    fields: [cookAlongs.recipeId],
    references: [recipes.id],
  }),
  host: one(users, {
    fields: [cookAlongs.hostId],
    references: [users.id],
  }),
  rsvps: many(cookAlongRsvps),
}));

export const cookAlongRsvpsRelations = relations(cookAlongRsvps, ({ one }) => ({
  cookAlong: one(cookAlongs, {
    fields: [cookAlongRsvps.cookAlongId],
    references: [cookAlongs.id],
  }),
  user: one(users, {
    fields: [cookAlongRsvps.userId],
    references: [users.id],
  }),
}));

export type CookAlong = typeof cookAlongs.$inferSelect;
export type NewCookAlong = typeof cookAlongs.$inferInsert;
export type CookAlongRsvp = typeof cookAlongRsvps.$inferSelect;
export type RsvpStatus = (typeof rsvpStatus.enumValues)[number];
