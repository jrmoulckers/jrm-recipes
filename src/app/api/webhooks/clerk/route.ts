import { env } from "~/env";
import { handleClerkEvent, type ClerkWebhookEvent } from "~/server/auth/clerk-webhook";
import { verifySvixSignature } from "~/server/auth/svix";

/**
 * Clerk webhook (issue #217) — the channel that keeps our `users` table in sync
 * with Clerk's source of truth: profile edits (`user.updated`) and account
 * deletions (`user.deleted`). Sibling to the Stripe webhook route; kept on the
 * Node runtime because Svix signature verification needs Node crypto and the raw
 * request body.
 *
 * Security: every event is authenticated by verifying the Svix signature headers
 * against `CLERK_WEBHOOK_SECRET` over the *raw* body (any pre-parsing would break
 * the HMAC), so this endpoint can't be spoofed. It degrades gracefully — 501 when
 * the secret is absent — and the handlers are idempotent, so Clerk's
 * at-least-once retries are safe.
 */
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const secret = env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Clerk webhook is not configured." },
      { status: 501 },
    );
  }

  // Read the raw body — verification is an HMAC over these exact bytes.
  const rawBody = await request.text();

  const verified = verifySvixSignature(
    secret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    rawBody,
  );
  if (!verified) {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: ClerkWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ClerkWebhookEvent;
  } catch {
    return Response.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    await handleClerkEvent(event);
  } catch {
    // Return 5xx so Clerk retries; handlers are idempotent, so replay is safe.
    return Response.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }

  return Response.json({ received: true });
}
