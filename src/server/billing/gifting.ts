import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { GIFT_CONFIG, type PlanId } from "~/config/plans";
import { db, isDbConfigured } from "~/server/db";
import { giftCodes } from "~/server/db/schema";

/**
 * Gift purchases + redemption (issue #331).
 *
 * A gift is a one-time Stripe payment that mints a single-use `gift_codes` row;
 * redeeming that code grants the redeemer a fixed span of Family. Grants flow
 * back through the normal entitlements resolver ({@link getActiveGiftPlanId} is
 * called from `getEffectivePlanId`), so no feature call site ever special-cases
 * a gift — a gifted family looks exactly like a paid one to every gate.
 *
 * Everything here is deliberately idempotent and single-use:
 *   - minting is keyed to the Stripe Checkout session (unique), so a retried
 *     webhook never creates a second code;
 *   - redemption is an atomic conditional update that only ever flips an
 *     `issued` row, so a double-redeem claims nothing and is rejected.
 */

/** Thrown by {@link redeemGiftCode} when no code matches. */
export const GIFT_NOT_FOUND = "GIFT_NOT_FOUND";
/** Thrown by {@link redeemGiftCode} when the code was already used. */
export const GIFT_ALREADY_REDEEMED = "GIFT_ALREADY_REDEEMED";

/** Ambiguous characters are dropped so codes are easy to read + retype. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Grouped for legibility (e.g. `GIFT-AB3D-7F9K-2QX4`); 12 random symbols. */
const CODE_SYMBOLS = 12;

/**
 * Generate an unguessable, human-friendly gift code. 12 symbols over a 32-char
 * alphabet is ~60 bits of entropy — impossible to guess, and the DB's unique
 * constraint is the ultimate backstop against the astronomically unlikely clash.
 */
export function generateGiftCode(): string {
  const bytes = randomBytes(CODE_SYMBOLS);
  let out = "";
  for (let i = 0; i < CODE_SYMBOLS; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  const grouped = out.replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3");
  return `GIFT-${grouped}`;
}

/** Normalize user input so `gift-ab3d…` and ` GIFT-AB3D… ` both match. */
export function normalizeGiftCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Add whole months to a date without mutating it (gift-duration math). */
function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

/**
 * Mint a gift code for a completed one-time Checkout (called from the webhook).
 * Idempotent: the unique `stripeSessionId` means a retried event never creates a
 * duplicate. Returns the freshly generated code (callers may ignore it — the
 * code is surfaced to the purchaser out of band).
 */
export async function mintGiftCode(input: {
  stripeSessionId: string;
  purchaserUserId?: string | null;
  planId?: PlanId;
  durationMonths?: number;
}): Promise<string> {
  const code = generateGiftCode();
  await db
    .insert(giftCodes)
    .values({
      code,
      planId: input.planId ?? GIFT_CONFIG.planId,
      durationMonths: input.durationMonths ?? GIFT_CONFIG.durationMonths,
      purchaserUserId: input.purchaserUserId ?? null,
      stripeSessionId: input.stripeSessionId,
      status: "issued",
    })
    .onConflictDoNothing();
  return code;
}

/** What a successful redemption granted. */
export interface RedeemedGift {
  planId: PlanId;
  durationMonths: number;
  redeemedAt: Date;
}

/**
 * Redeem a gift code for a user. The conditional `UPDATE … WHERE status =
 * 'issued'` is the single-use claim — atomic, so concurrent or repeat attempts
 * can only ever succeed once. A claim that touches no row is disambiguated into
 * {@link GIFT_NOT_FOUND} vs {@link GIFT_ALREADY_REDEEMED} for a precise message.
 */
export async function redeemGiftCode(input: {
  code: string;
  userId: string;
  now?: Date;
}): Promise<RedeemedGift> {
  const now = input.now ?? new Date();
  const code = normalizeGiftCode(input.code);

  const [claimed] = await db
    .update(giftCodes)
    .set({
      status: "redeemed",
      redeemedByUserId: input.userId,
      redeemedAt: now,
      updatedAt: now,
    })
    .where(and(eq(giftCodes.code, code), eq(giftCodes.status, "issued")))
    .returning({
      planId: giftCodes.planId,
      durationMonths: giftCodes.durationMonths,
    });

  if (claimed) {
    return {
      planId: claimed.planId,
      durationMonths: claimed.durationMonths,
      redeemedAt: now,
    };
  }

  const existing = await db.query.giftCodes.findFirst({
    where: eq(giftCodes.code, code),
    columns: { status: true },
  });
  throw new Error(existing ? GIFT_ALREADY_REDEEMED : GIFT_NOT_FOUND);
}

/**
 * The plan a user's redeemed, still-valid gifts grant right now — or `null` when
 * none apply. Called from the entitlements resolver so gifts light up premium
 * features through the same path as a subscription. A gift is valid until
 * `redeemedAt + durationMonths`; the furthest-reaching active gift wins.
 */
export async function getActiveGiftPlanId(
  userId: string,
  now: Date = new Date(),
): Promise<PlanId | null> {
  if (!isDbConfigured()) return null;

  const rows = await db.query.giftCodes.findMany({
    where: and(
      eq(giftCodes.redeemedByUserId, userId),
      eq(giftCodes.status, "redeemed"),
    ),
    columns: { planId: true, durationMonths: true, redeemedAt: true },
  });

  for (const row of rows) {
    if (!row.redeemedAt) continue;
    const expiresAt = addMonths(row.redeemedAt, row.durationMonths);
    if (expiresAt > now && row.planId !== "free") return row.planId;
  }
  return null;
}
