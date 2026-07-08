import type Stripe from "stripe";

import { env } from "~/env";
import { getStripe, isBillingConfigured } from "~/server/billing/stripe";
import { handleStripeEvent } from "~/server/billing/webhook";

/**
 * Stripe webhook (issue #304) — the channel that keeps our `subscriptions`
 * table in sync with Stripe's source of truth. Sibling to the Cloudinary sign
 * route; kept on the Node runtime because signature verification needs Node
 * crypto and the raw request body.
 *
 * Security: every event is authenticated by verifying the `Stripe-Signature`
 * against `STRIPE_WEBHOOK_SECRET` over the *raw* body (any pre-parsing would
 * break the HMAC), so this endpoint can't be spoofed. It degrades gracefully —
 * 503 when billing/webhook secrets are absent — and is idempotent, so Stripe's
 * at-least-once retries are safe.
 */
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!isBillingConfigured() || !secret) {
    return Response.json(
      { error: "Billing webhook is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing signature." }, { status: 400 });
  }

  // Read the raw body — verification is an HMAC over these exact bytes.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch {
    // Return 5xx so Stripe retries; handlers are idempotent, so replay is safe.
    return Response.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }

  return Response.json({ received: true });
}
