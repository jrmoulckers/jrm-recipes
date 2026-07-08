import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Heirloom env schema.
 *
 * Design goal: the app must *boot and build* with zero configuration so a
 * contributor (or CI) can run it immediately. Anything that would otherwise
 * be required is optional here; the auth/db/storage modules degrade to a
 * local "dev-bypass" mode when their vars are missing. Fill these in for
 * real data and production.
 *
 * Fail-closed exception: dev-bypass auth is strictly a LOCAL/TEST affordance.
 * `findProductionAuthIssues` + the guard at the bottom of this file make a real
 * production deploy (Vercel sets `VERCEL_ENV=production`) throw at build/boot
 * when the bypass flag is on or Clerk keys are missing, so a misconfigured
 * deploy dies instead of silently serving every request as one shared,
 * fully-authenticated account. The runtime auth module (`~/server/auth`) adds a
 * platform-agnostic per-request guard on top of this.
 */

/**
 * When `NODE_ENV=test` (or an explicit `SKIP_ENV_VALIDATION`) we skip *all*
 * validation, so unit tests and the zero-config CI/e2e build flows keep working
 * with dev-bypass.
 */
const skipValidation =
  !!process.env.SKIP_ENV_VALIDATION || process.env.NODE_ENV === "test";

/**
 * True when running in (or building for) a *real production deployment*, where
 * dev-bypass auth must be impossible. Vercel sets `VERCEL_ENV=production` for
 * production deploys (and `preview`/`development` otherwise), at both build and
 * runtime. This is deliberately narrower than `NODE_ENV==="production"`: Next
 * forces `NODE_ENV=production` for every `next build`/`next lint`, including the
 * zero-config CI + local builds that must keep passing. `SKIP_ENV_VALIDATION`
 * is the single escape hatch (used only by the CI build + e2e, which serve no
 * real users). Preview deploys are *not* caught here (they run as
 * `VERCEL_ENV=preview`), but are still fail-closed per request by the runtime
 * guard in `~/server/auth`, so no deployed environment can serve dev-bypass.
 *
 * @param {Record<string, string | undefined>} [vars]
 * @returns {boolean}
 */
export function isProductionDeploy(vars = process.env) {
  return vars.VERCEL_ENV === "production" && !vars.SKIP_ENV_VALIDATION;
}

/**
 * Reasons the given env would let dev-bypass auth run in production. Returns an
 * empty array when the config is safe (or when not in production). Kept pure
 * and exported so it can be unit-tested and reused by the runtime auth guard.
 *
 * @param {{
 *   NODE_ENV?: string;
 *   NEXT_PUBLIC_DEV_AUTH_BYPASS?: string;
 *   CLERK_SECRET_KEY?: string;
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
 * }} vars
 * @returns {string[]}
 */
export function findProductionAuthIssues(vars) {
  if (vars.NODE_ENV !== "production") return [];

  /** @type {string[]} */
  const issues = [];
  if (vars.NEXT_PUBLIC_DEV_AUTH_BYPASS === "1") {
    issues.push(
      'NEXT_PUBLIC_DEV_AUTH_BYPASS must not be "1" in production — dev-bypass ' +
        "auth is a local/test-only affordance.",
    );
  }
  if (!vars.CLERK_SECRET_KEY || !vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    issues.push(
      "CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY are required in " +
        "production (auth must not fall back to dev-bypass).",
    );
  }
  return issues;
}

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().url().optional(),
    CLERK_SECRET_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    // Shared secret guarding the weekly-digest trigger endpoint (#354). When
    // unset the endpoint is disabled (503) so it can never be triggered
    // anonymously; Vercel Cron sends it as `Authorization: Bearer <secret>`.
    CRON_SECRET: z.string().optional(),
    // Billing (Stripe) — optional (#299). Like every other external service,
    // billing degrades gracefully: with these unset the app boots, builds, and
    // stays fully clickable, and all billing code paths no-op (see
    // ~/server/billing/stripe `isBillingConfigured`).
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    // Stripe Price IDs (e.g. `price_123…`) for purchasable plans (#303). Optional
    // — with these unset checkout reports a friendly "not available" instead of
    // failing, so the app still builds and runs with no billing config.
    STRIPE_PRICE_FAMILY: z.string().optional(),
  },

  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().optional(),
    NEXT_PUBLIC_DEV_AUTH_BYPASS: z.string().optional(),
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
    NEXT_PUBLIC_CLOUDINARY_API_KEY: z.string().optional(),
    // Product analytics (PostHog) — optional. When unset the whole analytics
    // layer no-ops (see ~/lib/analytics) so the app boots + builds with no key.
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
    // Consent model for analytics. Set to "1" to require explicit opt-in
    // consent before any capture (GDPR-style); unset/other = opt-out model.
    NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT: z.string().optional(),
    // Stripe publishable key (client-safe) — optional (#299). Used only by the
    // billing UI; absent by default so the app runs with zero billing config.
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  },

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    NEXT_PUBLIC_DEV_AUTH_BYPASS: process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    NEXT_PUBLIC_CLOUDINARY_API_KEY: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT:
      process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_FAMILY: process.env.STRIPE_PRICE_FAMILY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },

  skipValidation,
  emptyStringAsUndefined: true,
});

/**
 * Fail-closed production auth guard.
 *
 * `@t3-oss/env-nextjs` has no hook for a cross-field refinement, so we run one
 * explicit Zod `superRefine` over the resolved auth vars. This build/boot guard
 * runs only for a real production deploy (`isProductionDeploy`) and only on the
 * server, so local dev, `NODE_ENV=test`, `next lint`, and the zero-config CI/e2e
 * build keep working with dev-bypass. Preview deploys skip *this* build-time
 * check but are still fail-closed at request time by the runtime guard in
 * `~/server/auth` (Vercel sets `NODE_ENV=production` on preview too), so any
 * deployed environment — preview or production — requires real Clerk keys.
 */
if (isProductionDeploy() && typeof window === "undefined") {
  const result = z
    .object({
      NEXT_PUBLIC_DEV_AUTH_BYPASS: z.string().optional(),
      CLERK_SECRET_KEY: z.string().optional(),
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
    })
    .superRefine((vars, ctx) => {
      for (const message of findProductionAuthIssues({
        NODE_ENV: "production",
        ...vars,
      })) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      }
    })
    .safeParse(process.env);

  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message);
    console.error("❌ Invalid environment variables:\n" + messages.join("\n"));
    throw new Error(
      "Invalid environment variables: dev-bypass auth cannot be enabled in " +
        "production. " +
        messages.join(" "),
    );
  }
}
