import { createId } from "@paralleldrive/cuid2";
import { timestamp, varchar } from "drizzle-orm/pg-core";

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
