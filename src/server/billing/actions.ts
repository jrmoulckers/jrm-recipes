"use server";

import { eq } from "drizzle-orm";

import { env } from "~/env";
import { getPlan, isPlanId } from "~/config/plans";
import { requireUser } from "~/server/auth";
import { db, isDbConfigured } from "~/server/db";
import { billingCustomers } from "~/server/db/schema";
import { getStripe, isBillingConfigured } from "./stripe";

/**
 * Stripe Checkout + Customer Portal server actions (issue #303).
 *
 * We never touch card data: both flows are Stripe-hosted. Following the
 * `src/server/recipes/actions.ts` pattern, every action returns a typed result
 * union and short-circuits with a friendly `{ ok: false, error }` when billing
 * or the DB is unconfigured (mirroring the `NO_DB` guard), so the UI can render
 * an explanation instead of crashing. All redirect URLs derive from
 * `NEXT_PUBLIC_APP_URL`, never a hard-coded host.
 */

export type BillingActionResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const BILLING_OFF =
  "Billing isn't set up yet. Add your Stripe keys (see .env.example) to enable upgrades.";
const NO_DB =
  "Billing needs a database. Set DATABASE_URL (see .env.example) to continue.";
const NO_CUSTOMER =
  "You don't have a billing account yet — start a plan from the pricing page first.";
const GENERIC =
  "We couldn't reach Stripe just now. Please try again in a moment.";

/** App origin for Stripe redirect URLs (never a hard-coded host). */
function appUrl(): string {
  return env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Map a plan's `stripePriceEnvKey` (a var *name*, never a value) to the
 * configured Price ID. Returns undefined when the plan isn't purchasable or the
 * price env var is unset.
 */
function resolvePriceId(envKey: string | null): string | undefined {
  switch (envKey) {
    case "STRIPE_PRICE_FAMILY":
      return env.STRIPE_PRICE_FAMILY;
    default:
      return undefined;
  }
}

/**
 * Find the caller's existing personal Stripe customer id, or create one (in
 * Stripe and in `billing_customers`) on first use. Personal billing is keyed to
 * the user; group/family billing is handled separately.
 */
async function ensureStripeCustomerId(userId: string): Promise<string> {
  const existing = await db.query.billingCustomers.findFirst({
    where: eq(billingCustomers.userId, userId),
    columns: { stripeCustomerId: true },
  });
  if (existing) return existing.stripeCustomerId;

  const user = await db.query.users.findFirst({
    where: (u, { eq: eqUser }) => eqUser(u.id, userId),
    columns: { email: true, name: true },
  });

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user?.email ?? undefined,
    name: user?.name ?? undefined,
    metadata: { userId },
  });

  await db
    .insert(billingCustomers)
    .values({ userId, stripeCustomerId: customer.id })
    .onConflictDoNothing();

  // Re-read in case a concurrent request created the row first; either way we
  // return the canonical stored customer id.
  const stored = await db.query.billingCustomers.findFirst({
    where: eq(billingCustomers.userId, userId),
    columns: { stripeCustomerId: true },
  });
  return stored?.stripeCustomerId ?? customer.id;
}

/**
 * Create a Stripe-hosted Checkout Session for a paid plan and return its URL.
 * Ensures a persisted Stripe customer first so webhooks can map the resulting
 * subscription back to the caller.
 */
export async function createCheckoutSessionAction(
  planId: string,
): Promise<BillingActionResult> {
  if (!isBillingConfigured()) return { ok: false, error: BILLING_OFF };
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  if (!isPlanId(planId) || planId === "free") {
    return { ok: false, error: "Choose a paid plan to upgrade." };
  }
  const plan = getPlan(planId);
  const priceId = resolvePriceId(plan.stripePriceEnvKey);
  if (!priceId) {
    return {
      ok: false,
      error: `The ${plan.name} plan isn't available for purchase yet.`,
    };
  }

  const user = await requireUser();
  try {
    const customerId = await ensureStripeCustomerId(user.id);
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      // Let customers enter Stripe-managed promotion codes at checkout (#326):
      // launch offers, community discounts, win-back — all owned in Stripe, no
      // coupon logic of our own.
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { userId: user.id, planId },
        // Start a Stripe-managed free trial when the plan offers one (#326). The
        // resolver already treats `trialing` as fully entitled, and the webhook
        // persists the trial end so the UI can show an honest end date.
        ...(plan.trialDays > 0
          ? { trial_period_days: plan.trialDays }
          : {}),
      },
      metadata: { userId: user.id, planId },
      success_url: `${appUrl()}/settings/billing?checkout=success`,
      cancel_url: `${appUrl()}/pricing?checkout=cancelled`,
    });
    if (!session.url) return { ok: false, error: GENERIC };
    return { ok: true, url: session.url };
  } catch {
    return { ok: false, error: GENERIC };
  }
}

/**
 * Create a Stripe Customer Portal session for the caller's existing customer so
 * they can update payment methods, view invoices, or cancel — self-serve, with
 * no billing UI of our own. Friendly error when they have no customer yet.
 */
export async function createBillingPortalSessionAction(): Promise<BillingActionResult> {
  if (!isBillingConfigured()) return { ok: false, error: BILLING_OFF };
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const user = await requireUser();
  const customer = await db.query.billingCustomers.findFirst({
    where: eq(billingCustomers.userId, user.id),
    columns: { stripeCustomerId: true },
  });
  if (!customer) return { ok: false, error: NO_CUSTOMER };

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: `${appUrl()}/settings/billing`,
    });
    return { ok: true, url: session.url };
  } catch {
    return { ok: false, error: GENERIC };
  }
}
