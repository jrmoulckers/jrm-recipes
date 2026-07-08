import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
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
    // `createdById` is intentionally left without a covering index (issue #153
    // audit): `groups` is a tiny, slow-growing table and the `set null` cascade
    // on user delete touches at most a handful of rows, so an index would cost
    // more on writes than it saves.
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

/** Lifecycle of a group invitation (issue #181). */
export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

/**
 * A pending (or resolved) invitation for someone to join a group (issue #181).
 * `group_members` only records people who are *already* in; this table carries
 * the not-yet-accepted state: who was invited (by email and/or handle, plus a
 * `userId` once they have an account), who invited them, the role they'll get
 * on accept, an opaque `token` for the accept link, and an optional expiry.
 */
export const groupInvitations = pgTable(
  "group_invitations",
  {
    id: pk(),
    groupId: fk()
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    // Who sent the invite; nulls out if that user is later removed so the
    // invitation record (and any membership it produced) survives.
    invitedById: fk().references(() => users.id, { onDelete: "set null" }),
    // The invitee's account once known — set at invite time if the email/handle
    // already maps to a user, otherwise stamped on accept.
    userId: fk().references(() => users.id, { onDelete: "set null" }),
    email: varchar({ length: 320 }),
    handle: varchar({ length: 60 }),
    role: memberRole().notNull().default("member"),
    token: varchar({ length: 64 }).notNull().unique(),
    status: invitationStatus().notNull().default("pending"),
    expiresAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // At most one *pending* invite per (group, email): prevents duplicate
    // outstanding invites while still allowing a fresh invite after a prior one
    // is revoked/expired/accepted. Partial so it ignores handle-only invites
    // (email IS NULL) and resolved rows. The unique `token` already covers
    // accept-link lookups, so no separate token index is needed.
    uniqueIndex("group_invitations_pending_email_uq")
      .on(t.groupId, t.email)
      .where(sql`${t.status} = 'pending' and ${t.email} is not null`),
    index("group_invitations_group_idx").on(t.groupId),
    // Must be reachable by at least one of email or handle (mirrors the Zod
    // `inviteInput` refine) so an invite can never be created with no invitee.
    check(
      "group_invitations_contact_check",
      sql`${t.email} is not null or ${t.handle} is not null`,
    ),
  ],
);

/**
 * Shareable, multi-use group invite links that onboard *new* users (issue
 * #343). Unlike `group_invitations` (a single-invitee record keyed to an
 * email/handle), a link carries no invitee: a manager generates one, shares the
 * URL, and anyone who opens it can join the group at `role`. Tokens are opaque
 * and unguessable; a link can be capped (`maxUses`), time-limited (`expiresAt`),
 * or revoked (`revokedAt`). `useCount` tracks accepted joins for the cap.
 */
export const groupInviteLinks = pgTable(
  "group_invite_links",
  {
    id: pk(),
    groupId: fk()
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    // Who created the link; nulls out if that user is later removed so the link
    // (and memberships it produced) survive.
    createdById: fk().references(() => users.id, { onDelete: "set null" }),
    role: memberRole().notNull().default("member"),
    token: varchar({ length: 64 }).notNull().unique(),
    // Null expiry = never expires; null maxUses = unlimited joins.
    expiresAt: timestamp({ withTimezone: true }),
    maxUses: integer(),
    useCount: integer().notNull().default(0),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("group_invite_links_group_idx").on(t.groupId),
    // Covering index for the createdById FK (issue #153 convention) so the
    // `set null` cascade on user delete doesn't sequentially scan.
    index("group_invite_links_created_by_idx").on(t.createdById),
  ],
);

export const groupsRelations = relations(groups, ({ many, one }) => ({
  members: many(groupMembers),
  invitations: many(groupInvitations),
  inviteLinks: many(groupInviteLinks),
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

export const groupInvitationsRelations = relations(
  groupInvitations,
  ({ one }) => ({
    group: one(groups, {
      fields: [groupInvitations.groupId],
      references: [groups.id],
    }),
    invitedBy: one(users, {
      fields: [groupInvitations.invitedById],
      references: [users.id],
      relationName: "invitedBy",
    }),
    user: one(users, {
      fields: [groupInvitations.userId],
      references: [users.id],
      relationName: "invitee",
    }),
  }),
);

export const groupInviteLinksRelations = relations(
  groupInviteLinks,
  ({ one }) => ({
    group: one(groups, {
      fields: [groupInviteLinks.groupId],
      references: [groups.id],
    }),
    createdBy: one(users, {
      fields: [groupInviteLinks.createdById],
      references: [users.id],
    }),
  }),
);

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type MemberRole = (typeof memberRole.enumValues)[number];
export type GroupInvitation = typeof groupInvitations.$inferSelect;
export type NewGroupInvitation = typeof groupInvitations.$inferInsert;
export type InvitationStatus = (typeof invitationStatus.enumValues)[number];
export type GroupInviteLink = typeof groupInviteLinks.$inferSelect;
export type NewGroupInviteLink = typeof groupInviteLinks.$inferInsert;
