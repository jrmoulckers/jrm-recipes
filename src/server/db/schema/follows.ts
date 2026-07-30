import { relations, sql } from "drizzle-orm";
import { check, index, pgTable, unique } from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";

/**
 * An opt-in, public follow edge (issue: public follow graph). `followerId`
 * follows `followeeId` so the follower sees the followee's *public* activity in
 * their following feed. Deliberately layered on top of the group-centric model:
 * a follow never grants access to family/group-private content — only content
 * the followee has made public counts, and only when the followee has turned on
 * {@link users.publicActivityOptIn}.
 *
 * Blocks always win over follows: filtering the following feed and the
 * follow/unfollow actions both consult {@link getHiddenAuthorIds}, so a block in
 * either direction severs the relationship's visibility.
 */
export const follows = pgTable(
  "follows",
  {
    id: pk(),
    followerId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followeeId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [
    // At most one edge per (follower, followee) — makes follow/unfollow idempotent.
    unique("follows_pair_uq").on(t.followerId, t.followeeId),
    // Reverse-lookup + cascade-covering indexes (issue #153 convention): "who do
    // I follow" reads followerId, "who follows me" / counts read followeeId.
    index("follows_follower_idx").on(t.followerId),
    index("follows_followee_idx").on(t.followeeId),
    // DB backstop: you can never follow yourself, even via a raw/seed write.
    check("follows_no_self_follow_check", sql`${t.followerId} <> ${t.followeeId}`),
  ],
);

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, {
    fields: [follows.followerId],
    references: [users.id],
    relationName: "follower",
  }),
  followee: one(users, {
    fields: [follows.followeeId],
    references: [users.id],
    relationName: "followee",
  }),
}));

export type Follow = typeof follows.$inferSelect;
export type NewFollow = typeof follows.$inferInsert;
