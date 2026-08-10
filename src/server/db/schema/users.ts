import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { pk, fk, timestamps } from './_shared';
import { groupMembers } from './groups';
import { recipes } from './recipes';
import { comments, ratings } from './engagement';
import { reviews } from './reviews';
import { follows } from './follows';

/**
 * Application users. Mirrors the identity provider (Clerk) but is the source of
 * truth for app data. `clerkId` is null for dev-bypass / seeded users.
 */
export const users = pgTable(
  'users',
  {
    id: pk(),
    clerkId: varchar({ length: 191 }).unique(),
    email: varchar({ length: 320 }),
    name: varchar({ length: 120 }),
    handle: varchar({ length: 60 }).unique(),
    // The app-owned public namespace (issue #666). Distinct from `handle`,
    // which mirrors Clerk's username: Clerk overwrites `handle` on every
    // `user.updated` and nulls it on deletion, so it can never be a stable URL
    // key. `slug` is the first segment of every canonical recipe URL
    // (`/recipes/<slug>/<recipeSlug>`), so it is NOT NULL and unique. It stays
    // user-changeable; `userSlugAliases` keeps old values resolving.
    slug: varchar({ length: 60 }).notNull().unique(),
    avatarUrl: varchar({ length: 2048 }),
    // Who owns `avatarUrl` (issue #659). Clerk is the default source: every
    // `user.updated` webhook mirrors `image_url` onto the local row, which is
    // right until the user picks a photo *in Heirloom*. Without this signal the
    // next Clerk sync would silently overwrite their choice, so an in-app upload
    // flips this to true and `applyClerkUserUpdate` then leaves the column
    // alone. Clearing the in-app avatar flips it back to false, which is how a
    // user says "go back to my Clerk photo".
    avatarUserManaged: boolean().notNull().default(false),
    // Opt-in (default off) for the weekly family recipe digest email (#354).
    // Off by default so we never email anyone who hasn't asked for it.
    weeklyDigestOptIn: boolean().notNull().default(false),
    // Opt-in (default off) for the public follow graph. A user is only
    // discoverable / followable, only contributes to follower feeds, and only
    // receives follow notifications when this is true. Off by default so
    // "family privacy by design" holds until someone explicitly opts in.
    publicActivityOptIn: boolean().notNull().default(false),
    // Soft-delete tombstone for Clerk-driven account deletion (issue #217). When
    // Clerk fires `user.deleted`, the webhook stamps this and anonymizes PII
    // (email/name/handle/avatar/clerkId nulled) while keeping the row so authored
    // recipes and group history stay referentially intact. NULL means the account
    // is live.
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index('users_clerk_id_idx').on(t.clerkId)],
);

/**
 * Every slug a user has ever held (issue #666). A user slug is the first
 * segment of every canonical recipe URL, so renaming it would silently kill
 * every link anyone ever shared to any of that user's recipes. Each retired
 * slug is retained here forever and 308-redirects to the current one.
 *
 * The primary key is the slug itself, which is what makes an alias *occupied*:
 * `uniqueUserSlug` refuses any slug held by a live user OR an alias, so a
 * released slug can never be claimed by a different account and silently
 * redirect old links to a stranger's recipes.
 *
 * Rows are deleted (not retained) when an account is deleted, so an
 * anonymized account stops leaking the personal slug it used to hold.
 */
export const userSlugAliases = pgTable(
  'user_slug_aliases',
  {
    slug: varchar({ length: 60 }).primaryKey(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('user_slug_aliases_user_idx').on(t.userId)],
);

export const userSlugAliasesRelations = relations(userSlugAliases, ({ one }) => ({
  user: one(users, {
    fields: [userSlugAliases.userId],
    references: [users.id],
  }),
}));

export type UserSlugAlias = typeof userSlugAliases.$inferSelect;

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(groupMembers),
  recipes: many(recipes),
  ratings: many(ratings),
  comments: many(comments),
  reviews: many(reviews),
  following: many(follows, { relationName: 'follower' }),
  followers: many(follows, { relationName: 'followee' }),
  slugAliases: many(userSlugAliases),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
