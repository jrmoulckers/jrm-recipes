import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, unique } from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";

/**
 * The kind of thing a reaction is attached to (issue #342). Reactions are
 * polymorphic — the same lightweight bar renders on comments, reviews, and
 * cook-log posts — so `targetType` + `targetId` identify the target rather than
 * a per-kind foreign key.
 */
export const reactionTarget = pgEnum("reaction_target", [
  "comment",
  "review",
  "cook_log",
]);

/**
 * The fixed, family-appropriate emoji set. Stored as a semantic key (not the
 * glyph) so the rendered emoji can be tweaked without a data migration and the
 * set can never drift to something unmoderated.
 */
export const reactionEmoji = pgEnum("reaction_emoji", [
  "love",
  "yum",
  "clap",
  "wow",
  "fire",
  "party",
]);

/** A single emoji reaction by a user on a comment / review / cook-log post. */
export const reactions = pgTable(
  "reactions",
  {
    id: pk(),
    targetType: reactionTarget().notNull(),
    // Polymorphic target id (matches pk width). No FK because the target table
    // varies; deletes are handled in application code alongside the target.
    targetId: fk().notNull(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: reactionEmoji().notNull(),
    ...timestamps(),
  },
  (t) => [
    // At most one of a given emoji per user per target — the toggle upserts
    // against this constraint.
    unique("reactions_target_user_emoji_uq").on(
      t.targetType,
      t.targetId,
      t.userId,
      t.emoji,
    ),
    // "All reactions for this target" (the bar) is the hot read.
    index("reactions_target_idx").on(t.targetType, t.targetId),
    // Covering index for the userId FK cascade + "my reactions" reads (#153).
    index("reactions_user_idx").on(t.userId),
  ],
);

export const reactionsRelations = relations(reactions, ({ one }) => ({
  user: one(users, {
    fields: [reactions.userId],
    references: [users.id],
  }),
}));

export type Reaction = typeof reactions.$inferSelect;
export type NewReaction = typeof reactions.$inferInsert;
export type ReactionTarget = (typeof reactionTarget.enumValues)[number];
export type ReactionEmoji = (typeof reactionEmoji.enumValues)[number];
