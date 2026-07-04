import { relations } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { recipes } from "./recipes";

/** A family or group that recipes can belong to and members collaborate in. */
export const groups = pgTable(
  "groups",
  {
    id: pk(),
    slug: varchar({ length: 80 }).notNull().unique(),
    name: varchar({ length: 120 }).notNull(),
    description: varchar({ length: 500 }),
    avatarUrl: varchar({ length: 2048 }),
    createdById: fk().references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [index("groups_slug_idx").on(t.slug)],
);

export const memberRole = pgEnum("member_role", [
  "owner",
  "admin",
  "member",
  "kid",
]);

/** Membership of a user in a group, with a role that governs permissions. */
export const groupMembers = pgTable(
  "group_members",
  {
    id: pk(),
    groupId: fk()
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole().notNull().default("member"),
    ...timestamps(),
  },
  (t) => [
    unique("group_members_group_user_uq").on(t.groupId, t.userId),
    index("group_members_user_idx").on(t.userId),
  ],
);

export const groupsRelations = relations(groups, ({ many, one }) => ({
  members: many(groupMembers),
  recipes: many(recipes),
  createdBy: one(users, {
    fields: [groups.createdById],
    references: [users.id],
  }),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupMembers.userId],
    references: [users.id],
  }),
}));

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type MemberRole = (typeof memberRole.enumValues)[number];
