import { relations, sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { recipes } from "./recipes";
import { groups } from "./groups";

/**
 * The social event a notification represents (issue #348). Kept broad enough to
 * cover the whole community batch: mentions, replies, suggestions, reviews,
 * cooks, reactions, group membership, cook-along invites/reminders, and
 * moderation reports.
 */
export const notificationType = pgEnum("notification_type", [
  "mention",
  "comment_reply",
  "suggestion",
  "review",
  "cook",
  "reaction",
  "group_invite",
  "group_join",
  "cook_along_invite",
  "cook_along_reminder",
  "report",
]);

/**
 * An in-app notification for a single recipient (issue #348). `actorId` is who
 * caused it (nullable so a system/reminder notification has no actor).
 * `recipeId` / `groupId` are real FKs (cleaned up on delete); `entityId` is a
 * free-form pointer to the specific comment / review / cook-along the event is
 * about, and `context` carries a short pre-rendered label so the inbox never
 * has to re-join every source table to draw a row.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    recipientId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: fk().references(() => users.id, { onDelete: "set null" }),
    type: notificationType().notNull(),
    recipeId: fk().references(() => recipes.id, { onDelete: "cascade" }),
    groupId: fk().references(() => groups.id, { onDelete: "cascade" }),
    // Opaque id of the comment/review/cook-along/etc. the notification points at.
    entityId: fk(),
    // Short, pre-rendered context (e.g. a recipe title) for the inbox row.
    context: varchar({ length: 500 }),
    readAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // "My recent notifications, newest first" — the inbox + bell dropdown read.
    index("notifications_recipient_idx").on(t.recipientId, t.createdAt),
    // Partial index backing the unread-count badge without scanning read rows.
    index("notifications_recipient_unread_idx")
      .on(t.recipientId)
      .where(sql`${t.readAt} is null`),
    // Covering indexes for the FK cascades (#153 convention).
    index("notifications_actor_idx").on(t.actorId),
    index("notifications_recipe_idx").on(t.recipeId),
    index("notifications_group_idx").on(t.groupId),
  ],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(users, {
    fields: [notifications.recipientId],
    references: [users.id],
    relationName: "recipient",
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: "actor",
  }),
  recipe: one(recipes, {
    fields: [notifications.recipeId],
    references: [recipes.id],
  }),
  group: one(groups, {
    fields: [notifications.groupId],
    references: [groups.id],
  }),
}));

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationType = (typeof notificationType.enumValues)[number];
