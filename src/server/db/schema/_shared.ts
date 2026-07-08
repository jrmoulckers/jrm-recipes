import { createId } from "@paralleldrive/cuid2";
import { timestamp, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";

/** Primary key: short, URL-safe, collision-resistant cuid2. */
export const pk = () =>
  varchar({ length: 24 })
    .primaryKey()
    .$defaultFn(() => createId());

/** Foreign-key column (matches pk width). */
export const fk = () => varchar({ length: 24 });

/** created_at / updated_at pair shared by every table. */
export const timestamps = () => ({
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

/**
 * Soft-delete + audit pair (issue #165). `deletedAt IS NULL` means the row is
 * live; a timestamp tombstones it while preserving child history (versions,
 * events, ratings, comments). `deletedBy` records the actor and nulls out if
 * that user is later removed. `userIdColumn` is passed in so this helper stays
 * in `_shared` without importing the users table (which would be circular).
 */
export const softDelete = (userIdColumn: () => AnyPgColumn) => ({
  deletedAt: timestamp({ withTimezone: true }),
  deletedBy: fk().references(userIdColumn, { onDelete: "set null" }),
});
