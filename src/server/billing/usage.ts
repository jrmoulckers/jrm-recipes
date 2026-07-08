import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  recipes,
  usageCounters,
  type UsageMetric,
  type User,
} from "~/server/db/schema";

/**
 * Usage metering foundation (issue #301).
 *
 * Tiering only works if we can measure consumption, so this module is the one
 * place that reads/writes `usage_counters`. It is deliberately Stripe-free:
 * soft-limit checks (#318) and the billing settings meter (#319) read through
 * here, and it degrades to a safe read-through of zero when the DB is
 * unconfigured (matching every other external-service seam in the app).
 *
 * Two flavours of metric:
 *   - Count metrics (`recipes`, `storage_mb`) accumulate for the life of the
 *     account, so they share a fixed sentinel period. `recipes` is authoritative
 *     from the `recipes` table (see {@link recomputeRecipeCount}); `storage_mb`
 *     is summed at upload via {@link incrementUsage}.
 *   - Metered metrics (`ai_credits`) reset monthly: their period is the first of
 *     the current UTC month, so a new month reads zero automatically.
 */

/** Fixed sentinel period for lifetime/count metrics (epoch, UTC). */
const LIFETIME_PERIOD = new Date(0);

/** Metrics that reset at the start of each calendar month (UTC). */
const MONTHLY_METRICS = new Set<UsageMetric>(["ai_credits"]);

/** The billing owner for a metric row. Personal usage is keyed to the user. */
function ownerOf(user: User): { ownerId: string; ownerType: "user" } {
  return { ownerId: user.id, ownerType: "user" };
}

/**
 * The period a metric is bucketed into. Monthly metrics roll to a new bucket on
 * the 1st (UTC) so reads reset without any cron; count metrics share a single
 * lifetime bucket.
 */
export function currentPeriodStart(
  metric: UsageMetric,
  now: Date = new Date(),
): Date {
  if (MONTHLY_METRICS.has(metric)) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  return LIFETIME_PERIOD;
}

/**
 * Live count of a user's own, non-deleted recipes. Authoritative for the
 * `recipes` metric (cheaper and always correct vs. a drifting counter), and
 * used by the soft-limit check before create (#318).
 */
export async function recomputeRecipeCount(user: User): Promise<number> {
  if (!isDbConfigured()) return 0;
  return db.$count(
    recipes,
    and(eq(recipes.authorId, user.id), isNull(recipes.deletedAt)),
  );
}

/**
 * Current usage for `metric` in the active period. `recipes` reads live from the
 * recipes table; other metrics read their counter row (0 when absent). Returns 0
 * when the DB is unconfigured so callers can treat "no DB" as "no usage".
 */
export async function getUsage(
  user: User,
  metric: UsageMetric,
  now: Date = new Date(),
): Promise<number> {
  if (!isDbConfigured()) return 0;
  if (metric === "recipes") return recomputeRecipeCount(user);

  const { ownerId } = ownerOf(user);
  const row = await db.query.usageCounters.findFirst({
    where: and(
      eq(usageCounters.ownerId, ownerId),
      eq(usageCounters.metric, metric),
      eq(usageCounters.periodStart, currentPeriodStart(metric, now)),
    ),
  });
  return row?.value ?? 0;
}

/**
 * Add `amount` to a metric's counter for the active period, creating the row on
 * first write. Idempotent per `(ownerId, metric, periodStart)` via upsert, so
 * concurrent uploads accumulate rather than clobber. No-op (and no throw) when
 * the DB is unconfigured. Not used for `recipes`, which is derived.
 */
export async function incrementUsage(
  user: User,
  metric: UsageMetric,
  amount: number,
  now: Date = new Date(),
): Promise<void> {
  if (!isDbConfigured()) return;
  if (amount === 0) return;

  const { ownerId, ownerType } = ownerOf(user);
  const periodStart = currentPeriodStart(metric, now);

  await db
    .insert(usageCounters)
    .values({ ownerId, ownerType, metric, periodStart, value: amount })
    .onConflictDoUpdate({
      target: [
        usageCounters.ownerId,
        usageCounters.metric,
        usageCounters.periodStart,
      ],
      set: {
        value: sql`${usageCounters.value} + ${amount}`,
        updatedAt: new Date(),
      },
    });
}
