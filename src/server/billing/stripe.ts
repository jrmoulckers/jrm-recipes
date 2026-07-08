import "server-only";

import Stripe from "stripe";

import { env } from "~/env";

/**
 * The one place the rest of Heirloom touches the Stripe SDK (issue #299).
 *
 * Billing follows the same "degrade gracefully when unconfigured" principle as
 * auth, the DB, and Cloudinary: with no `STRIPE_SECRET_KEY` the app still boots,
 * builds, and stays fully clickable. `isBillingConfigured()` mirrors
 * `isAuthConfigured()` / `isDbConfigured()`, and `getStripe()` is instantiated
 * lazily so importing this module never constructs a client (or throws) until a
 * billing code path is actually exercised with keys present.
 *
 * No secret values live here — the key is read only from the environment.
 */

/**
 * We intentionally do not pass an explicit `apiVersion`: the pinned `stripe`
 * package version in package.json already fixes the API version to the SDK's
 * default, so upgrades are a deliberate, reviewed dependency bump rather than a
 * silent string change.
 */
let cached: Stripe | undefined;

/** True when a server-side Stripe secret key is configured. */
export function isBillingConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/** True when webhook signature verification can run (both secrets present). */
export function isWebhookConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

/**
 * The lazily-instantiated Stripe client. Throws a clear, actionable error only
 * when called while billing is unconfigured — callers should guard with
 * {@link isBillingConfigured} and no-op gracefully instead of relying on this
 * throw (which exists as a safety net, not a control-flow path).
 */
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY (see .env.example) to " +
        "enable billing. Guard billing code with isBillingConfigured() so it " +
        "no-ops when keys are absent.",
    );
  }
  cached ??= new Stripe(env.STRIPE_SECRET_KEY, {
    typescript: true,
    appInfo: {
      name: "Heirloom",
      url: "https://github.com/jrmoulckers/jrm-recipes",
    },
  });
  return cached;
}
