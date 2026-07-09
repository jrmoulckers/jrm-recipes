import { relations } from "drizzle-orm";
import { boolean, index, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

import { pk, timestamps } from "./_shared";
import { groupMembers } from "./groups";
import { recipes } from "./recipes";
import { comments, ratings } from "./engagement";
import { reviews } from "./reviews";

/**
 * Application users. Mirrors the identity provider (Clerk) but is the source of
 * truth for app data. `clerkId` is null for dev-bypass / seeded users.
 */
export const users = pgTable(
  "users",
  {
    id: pk(),
    clerkId: varchar({ length: 191 }).unique(),
    email: varchar({ length: 320 }),
    name: varchar({ length: 120 }),
    handle: varchar({ length: 60 }).unique(),
    avatarUrl: varchar({ length: 2048 }),
    // Opt-in (default off) for the weekly family recipe digest email (#354).
    // Off by default so we never email anyone who hasn't asked for it.
    weeklyDigestOptIn: boolean().notNull().default(false),
    // Soft-delete tombstone for Clerk-driven account deletion (issue #217). When
    // Clerk fires `user.deleted`, the webhook stamps this and anonymizes PII
    // (email/name/handle/avatar/clerkId nulled) while keeping the row so authored
    // recipes and group history stay referentially intact. NULL means the account
    // is live.
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("users_clerk_id_idx").on(t.clerkId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(groupMembers),
  recipes: many(recipes),
  ratings: many(ratings),
  comments: many(comments),
  reviews: many(reviews),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
