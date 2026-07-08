import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { groups } from "./groups";

/**
 * A personal, private block (issue #355). The blocker never sees the blocked
 * user's comments, reviews, reactions, or cook posts again. Blocks are one-way
 * records (filtering also hides the blocker's content from the blocked user
 * where appropriate) and fully reversible.
 */
export const userBlocks = pgTable(
  "user_blocks",
  {
    id: pk(),
    blockerId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [
    unique("user_blocks_pair_uq").on(t.blockerId, t.blockedId),
    index("user_blocks_blocker_idx").on(t.blockerId),
    index("user_blocks_blocked_idx").on(t.blockedId),
  ],
);

/** What a report / moderation action targets (issues #356, #357). */
export const moderationTarget = pgEnum("moderation_target", [
  "comment",
  "review",
  "cook_log",
]);

/** Why a member reported something (issue #356). */
export const reportReason = pgEnum("report_reason", [
  "spam",
  "harassment",
  "inappropriate",
  "other",
]);

/** Lifecycle of a report in the moderation queue (issues #356, #357). */
export const reportStatus = pgEnum("report_status", [
  "open",
  "resolved",
  "dismissed",
]);

/**
 * A member's report of a comment / review / cook-log post (issue #356), routed
 * to the owning group's moderation queue (issue #357). De-duped per
 * (target, reporter) so repeat reports by the same person don't inflate counts;
 * the queue aggregates by target. Reporter identity is never shown to other
 * members.
 */
export const contentReports = pgTable(
  "content_reports",
  {
    id: pk(),
    targetType: moderationTarget().notNull(),
    targetId: fk().notNull(),
    reporterId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The group whose owners/admins can action this report. Nullable because a
    // reported item may not belong to a group (public recipe); such reports are
    // still recorded for auditing.
    groupId: fk().references(() => groups.id, { onDelete: "cascade" }),
    reason: reportReason().notNull(),
    detail: text(),
    status: reportStatus().notNull().default("open"),
    resolvedById: fk().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // De-dupe: one open/standing report per person per target.
    unique("content_reports_target_reporter_uq").on(
      t.targetType,
      t.targetId,
      t.reporterId,
    ),
    // The moderation queue reads open reports for a group.
    index("content_reports_group_status_idx").on(t.groupId, t.status),
    // Aggregate report count per target.
    index("content_reports_target_idx").on(t.targetType, t.targetId),
    index("content_reports_reporter_idx").on(t.reporterId),
    index("content_reports_resolved_by_idx").on(t.resolvedById),
  ],
);

export const userBlocksRelations = relations(userBlocks, ({ one }) => ({
  blocker: one(users, {
    fields: [userBlocks.blockerId],
    references: [users.id],
    relationName: "blocker",
  }),
  blocked: one(users, {
    fields: [userBlocks.blockedId],
    references: [users.id],
    relationName: "blocked",
  }),
}));

export const contentReportsRelations = relations(contentReports, ({ one }) => ({
  reporter: one(users, {
    fields: [contentReports.reporterId],
    references: [users.id],
    relationName: "reporter",
  }),
  group: one(groups, {
    fields: [contentReports.groupId],
    references: [groups.id],
  }),
  resolvedBy: one(users, {
    fields: [contentReports.resolvedById],
    references: [users.id],
    relationName: "resolvedBy",
  }),
}));

export type UserBlock = typeof userBlocks.$inferSelect;
export type NewUserBlock = typeof userBlocks.$inferInsert;
export type ContentReport = typeof contentReports.$inferSelect;
export type NewContentReport = typeof contentReports.$inferInsert;
export type ModerationTarget = (typeof moderationTarget.enumValues)[number];
export type ReportReason = (typeof reportReason.enumValues)[number];
export type ReportStatus = (typeof reportStatus.enumValues)[number];
