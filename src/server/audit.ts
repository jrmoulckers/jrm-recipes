import "server-only";

import { db } from "~/server/db";
import { auditLog } from "~/server/db/schema";

type Db = typeof db;
/** The transaction handle drizzle hands to `db.transaction(async (tx) => …)`. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Stable machine keys for audited actions (issue #219). Keep these in sync with
 * anything that queries the audit log; new sensitive actions should add a key
 * here rather than passing an ad-hoc string.
 */
export const AuditAction = {
  GroupMemberRoleUpdated: "group.member_role_updated",
  GroupMemberAdded: "group.member_added",
  GroupMemberRemoved: "group.member_removed",
  GroupOwnershipTransferred: "group.ownership_transferred",
  GroupDeleted: "group.deleted",
  RecipeDeleted: "recipe.deleted",
  RecipeVisibilityChanged: "recipe.visibility_changed",
  RecipeShareLinkChanged: "recipe.share_link_changed",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * A closed set of known values that still accepts an arbitrary string, without
 * the literals being collapsed into `string` (which `no-redundant-type-
 * constituents` rightly flags). The `string & {}` intersection keeps the
 * literal members visible for autocomplete.
 */
type LiteralUnion<T extends string> = T | (string & {});

export type AuditEntry = {
  actorId: string | null;
  action: LiteralUnion<AuditAction>;
  targetType: LiteralUnion<"group" | "recipe" | "user">;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Append a row to the security audit log. Best-effort and non-throwing by
 * design (mirroring `recordEvent`): a failure to write the audit trail must
 * never roll back or block the sensitive action it is describing. Pass the
 * surrounding transaction when one is available so the audit row commits
 * atomically with the change; otherwise the top-level `db` is used.
 */
export async function recordAudit(exec: Db | Tx, entry: AuditEntry): Promise<void> {
  try {
    await exec.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    });
  } catch {
    // Best-effort: swallow so audit-log unavailability never breaks the mutation.
  }
}
