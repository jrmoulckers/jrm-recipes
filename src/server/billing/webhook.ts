import "server-only";

import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import type { PlanId } from "~/config/plans";
import { db, isDbConfigured } from "~/server/db";
import {
  billingCustomers,
  subscriptions,
  type SubscriptionStatus,
} from "~/server/db/schema";

/**
 * Stripe → DB subscription sync (issue #304).
 *
 * Stripe is the source of truth for what a family has actually paid for; this
 * module keeps our `subscriptions` table in step so the entitlements resolver
 * (#302) can gate purely from the DB. It is deliberately idempotent — every
 * write is an upsert keyed to the Stripe id — so receiving the same event twice
 * (Stripe retries, at-least-once delivery) is always safe. Signature
 * verification lives in the route; here we only trust already-verified events.
 */

/** Map a Stripe subscription status onto our narrower enum. */
export function mapStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "incomplete":
      return "incomplete";
    // canceled, incomplete_expired, paused, and anything unknown → canceled: no
    // access, and the entitlements resolver treats it as Free.
    default:
      return "canceled";
  }
}

/** Period-end seconds, tolerant of where the Stripe API version places it. */
function periodEndSeconds(sub: Stripe.Subscription): number | undefined {
  const top = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  if (typeof top === "number") return top;
  const item = sub.items?.data?.[0] as unknown as
    | { current_period_end?: number }
    | undefined;
  return item?.current_period_end;
}

/** The Stripe customer id off a subscription/invoice, whatever its shape. */
function customerIdOf(
  customer: string | { id: string } | null | undefined,
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Ensure a `billing_customers` row links this Stripe customer to an owner,
 * returning our internal id. Creates the link on first sight using the
 * `userId` we stamped into subscription/checkout metadata; returns null when we
 * can't attribute an owner (so the caller skips rather than violating the
 * one-owner constraint).
 */
async function ensureCustomerLink(
  stripeCustomerId: string,
  userId: string | undefined,
): Promise<string | null> {
  const existing = await db.query.billingCustomers.findFirst({
    where: eq(billingCustomers.stripeCustomerId, stripeCustomerId),
    columns: { id: true },
  });
  if (existing) return existing.id;
  if (!userId) return null;

  const [created] = await db
    .insert(billingCustomers)
    .values({ userId, stripeCustomerId })
    .onConflictDoNothing()
    .returning({ id: billingCustomers.id });
  if (created) return created.id;

  const again = await db.query.billingCustomers.findFirst({
    where: eq(billingCustomers.stripeCustomerId, stripeCustomerId),
    columns: { id: true },
  });
  return again?.id ?? null;
}

/**
 * Upsert the DB row for a Stripe subscription (create/update/delete all flow
 * through here — a deleted subscription simply carries a `canceled` status).
 * No-op when the DB is unconfigured or we can't attribute an owner.
 */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  if (!isDbConfigured()) return;

  const stripeCustomerId = customerIdOf(sub.customer);
  if (!stripeCustomerId) return;

  const userId = sub.metadata?.userId ?? undefined;
  const customerId = await ensureCustomerLink(stripeCustomerId, userId);
  if (!customerId) return;

  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const endSeconds = periodEndSeconds(sub);
  // Only the Family plan is purchasable today, so any synced subscription is
  // Family; `stripePriceId` records exactly which price for future catalogs.
  const planId: PlanId = "family";

  await db
    .insert(subscriptions)
    .values({
      customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      planId,
      status: mapStatus(sub.status),
      currentPeriodEnd: endSeconds ? new Date(endSeconds * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      seats: item?.quantity ?? 1,
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        customerId,
        stripePriceId: priceId,
        planId,
        status: mapStatus(sub.status),
        currentPeriodEnd: endSeconds ? new Date(endSeconds * 1000) : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        seats: item?.quantity ?? 1,
        updatedAt: new Date(),
      },
    });
}

/** Ensure the customer link exists early, on Checkout completion. */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (!isDbConfigured()) return;
  const stripeCustomerId = customerIdOf(session.customer);
  if (!stripeCustomerId) return;
  await ensureCustomerLink(stripeCustomerId, session.metadata?.userId ?? undefined);
}

/** Flag the subscription past-due when an invoice payment fails. */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  if (!isDbConfigured()) return;
  const subRef = (
    invoice as unknown as { subscription?: string | { id: string } | null }
  ).subscription;
  const subId = customerIdOf(subRef);
  if (!subId) return;
  await db
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, subId));
}

/**
 * Dispatch an already-verified Stripe event. Known lifecycle events are synced;
 * unknown types are intentionally ignored (the route still 200s them). Throwing
 * here signals the route to return 5xx so Stripe retries — safe because every
 * handler is idempotent.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object as Stripe.Subscription);
      return;
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      return;
    default:
      // Acknowledge and ignore everything else.
      return;
  }
}
