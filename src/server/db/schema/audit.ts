import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

import { fk, pk } from "./_shared";
import { users } from "./users";

/**
 * Append-only security audit log (issue #219).
 *
 * Sensitive, authorization-changing actions — group role changes, member
 * add/remove, ownership transfer, group deletion, recipe deletion, and recipe
 * visibility/share-link changes — must leave a durable, queryable "who changed
 * what, when, from what to what" trail for incident response and abuse
 * investigation. This is distinct from `recipeVersions`/`recipeEvents`, which
 * are product timeline data, not a security log of actor-attributed access
 * changes.
 *
 * Writes are best-effort and never block the primary mutation (mirroring
 * `recordEvent`). Rows are never updated or deleted by the app; `actorId` uses
 * `ON DELETE set null` so the record survives even if the actor's account is
 * later removed. `metadata` carries a compact before/after change summary.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    // The user who performed the action. Nullable + set-null so audit rows
    // outlive the actor (and system/anonymous actions can be recorded).
    actorId: fk().references(() => users.id, { onDelete: "set null" }),
    // Machine action key, e.g. "group.member_role_updated", "recipe.deleted".
    action: varchar({ length: 80 }).notNull(),
    // The kind of entity affected ("group", "recipe", "user") and its id. The id
    // is a bare column (no FK) so the log survives the target's hard deletion.
    targetType: varchar({ length: 40 }).notNull(),
    targetId: varchar({ length: 24 }),
    // Compact change summary (before/after roles, visibility, etc.).
    metadata: jsonb().$type<Record<string, unknown>>(),
    // Request context when available; best-effort, may be null.
    ipAddress: varchar({ length: 64 }),
    userAgent: varchar({ length: 512 }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // "What did this actor do, most-recent-first" and "what happened to this
    // target" are the two investigation reads the log is built to serve.
    index("audit_log_actor_idx").on(t.actorId, t.createdAt),
    index("audit_log_target_idx").on(t.targetType, t.targetId),
  ],
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(users, {
    fields: [auditLog.actorId],
    references: [users.id],
  }),
}));

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
