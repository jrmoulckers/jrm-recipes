# Secrets management

This runbook covers the secrets and sensitive configuration used by Heirloom. It is grounded in `.env.example`, `src/env.js`, deployment docs, and the code paths that read these variables.

Provider dashboards and exact buttons change over time, so the steps below describe the required control objective and mark provider-specific details as deployment-dependent when they are not evidenced in the repo.

## Storage policy

- Store secrets in **Vercel project environment variables** per environment: Production, Preview, and any staging deployment.
- Never commit real secrets. `.gitignore` excludes `.env`, `.env*.local`, `.vercel`, and `.clerk/`.
- CI runs Gitleaks through `.github/workflows/ci.yml`; `.gitleaks.toml` keeps the default detector set with a narrow allowlist for test fixtures.
- Keep Preview and staging isolated. Do not point Preview at the production `DATABASE_URL`; `scripts/migrate.mjs` skips preview migrations unless `ALLOW_PREVIEW_MIGRATIONS=1` is deliberately set for an isolated database branch.

## Environment-variable inventory

Owners below are a template to fill in for the team. Cadence is a recommended default; always rotate immediately on suspected exposure, vendor compromise, contractor offboarding, or role change.

| Category | Variables | Secret? | Store | Template owner | Recommended rotation |
| --- | --- | --- | --- | --- | --- |
| Postgres database | `DATABASE_URL` | Yes | Vercel env vars per environment | Eng lead / repo admins | Quarterly; immediately on exposure/offboarding |
| Migration/seed direct database URL | `DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING` (used by scripts; deployment-dependent and not listed in `.env.example`) | Yes | Vercel/build env vars only when the host provides them | Eng lead / repo admins | Quarterly with database credentials |
| Clerk auth | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Secret key is secret; publishable key and URLs are public config | Vercel env vars per environment | Eng lead / identity owner | Quarterly for `CLERK_SECRET_KEY`; on Clerk instance changes |
| Clerk webhooks | `CLERK_WEBHOOK_SECRET` (validated in `src/env.js`; used by `/api/webhooks/clerk`) | Yes | Vercel env vars per environment | Eng lead / identity owner | Quarterly; immediately on endpoint exposure |
| Cloudinary uploads | `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | API secret is secret; cloud name/API key are public config | Vercel env vars per environment | Eng lead / media owner | Quarterly for `CLOUDINARY_API_SECRET`; on media-provider changes |
| Stripe billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_FAMILY`, `STRIPE_PRICE_GIFT_FAMILY` | Secret/webhook keys are secret; publishable key and Price IDs are not treated as credentials | Vercel env vars per environment | Billing owner + Eng lead | Quarterly for secret/webhook keys; when products/prices change |
| PostHog analytics | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT` | Public client config, but still sensitive operational config | Vercel env vars per environment | Product/analytics owner | On project changes or suspected misuse |
| App URL and auth bypass | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_DEV_AUTH_BYPASS` | Not secrets | Vercel env vars / local `.env` | Eng lead | Review before every deploy; never set auth bypass to `1` on deploys |
| Digest cron trigger | `CRON_SECRET` (validated in `src/env.js`; used by `/api/digest`) | Yes | Vercel env vars per environment when digest trigger is enabled | Eng lead / operations owner | Quarterly; immediately on endpoint exposure |
| Error monitoring placeholder | `NEXT_PUBLIC_SENTRY_DSN` appears in `.env.example` as optional future wiring, but is not currently validated in `src/env.js` | Usually public client config | Deployment-dependent if/when Sentry is wired | Eng lead / operations owner | On project changes |
| Logging | `LOG_LEVEL` | Not secret | Vercel env vars if overriding defaults | Eng lead / operations owner | As needed |
| CI/build escape hatch | `SKIP_ENV_VALIDATION` | Not secret, but security-sensitive | CI/build env only | Eng lead / repo admins | Avoid outside CI/e2e |
| Preview migration opt-in | `ALLOW_PREVIEW_MIGRATIONS` | Not secret, but security-sensitive | Preview env only with isolated DB | Eng lead / repo admins | Remove when no longer needed |

## Stripe Price ID convention

`src/config/plans.ts` stores only the environment-variable **names** in `stripePriceEnvKey`, such as `STRIPE_PRICE_FAMILY` and `STRIPE_PRICE_GIFT_FAMILY`. The actual Stripe Price IDs live in environment variables and are resolved in `src/server/billing/actions.ts`.

This means no Stripe billing ID or secret needs to be committed to source.

## Rotation runbooks

### Rotate Clerk keys and webhook secret

1. Open the Clerk application for the target environment.
2. Create or reveal the replacement publishable and secret keys according to Clerk's current key-rotation flow.
3. If the Clerk webhook endpoint is enabled, create or rotate the endpoint signing secret for `/api/webhooks/clerk`.
4. Update Vercel environment variables:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `CLERK_WEBHOOK_SECRET`
5. Redeploy the affected environment.
6. Verify:
   - sign-in/sign-up works;
   - an authenticated page resolves the current user;
   - Clerk webhook delivery succeeds with signature verification.
7. Revoke the old Clerk secret and old webhook signing secret after the new deploy is healthy.
8. If the old key may have been exposed, invalidate affected sessions in Clerk and review app audit logs.

### Rotate Stripe keys, webhook secret, and Price IDs

1. In Stripe, create replacement API keys for the environment.
2. Update Vercel:
   - `STRIPE_SECRET_KEY`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
3. For webhooks, create a new signing secret for `https://<your-domain>/api/stripe/webhook` and update:
   - `STRIPE_WEBHOOK_SECRET`
4. If pricing changed, create new Stripe Prices and update:
   - `STRIPE_PRICE_FAMILY`
   - `STRIPE_PRICE_GIFT_FAMILY`
5. Redeploy.
6. Verify:
   - pricing page renders the expected purchase state;
   - Stripe Checkout can be created;
   - Customer Portal can be opened for a billed user;
   - webhook test delivery succeeds and invalid signatures are rejected.
7. Disable old webhook endpoints/signing secrets and revoke old API keys after validation.
8. Review recent Stripe events for suspicious activity.

### Rotate Cloudinary credentials

1. In Cloudinary, create or rotate the API key/secret for the target cloud.
2. Update Vercel:
   - `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
   - `NEXT_PUBLIC_CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
3. Redeploy.
4. Verify signed uploads from the recipe editor and image delivery from `res.cloudinary.com`.
5. Revoke the old API secret/key after uploads are confirmed.
6. Review Cloudinary access/activity logs for unexpected uploads or transformations.

### Rotate Postgres credentials

The exact flow is managed-Postgres-host dependent, for example Neon, Supabase, or RDS.

1. Create a new database role/password or rotate the existing password using the provider's supported process.
2. Generate a new connection string for each environment:
   - runtime `DATABASE_URL`;
   - direct migration URL such as `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING`, if the host provides one.
3. Update Vercel environment variables for the target environment only.
4. Redeploy.
5. Verify:
   - `/api/health` returns `db: "ok"` when a database is configured;
   - a recipe read/write smoke test works;
   - the migration runner can connect with the intended URL.
6. Revoke the old role/password only after all healthy deployments use the new URL.
7. Review provider connection logs for use of the old credential after revocation.

### Rotate PostHog configuration

1. In PostHog, create or identify the replacement project key for the target project.
2. Update Vercel:
   - `NEXT_PUBLIC_POSTHOG_KEY`
   - `NEXT_PUBLIC_POSTHOG_HOST` if changing region or self-hosted endpoint.
3. Confirm `NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT` matches the intended consent model.
4. Redeploy.
5. Verify that browser capture is routed through the first-party `/ingest` proxy and that DNT/GPC and in-app opt-out behavior still work.
6. Disable the old project key or project if it should no longer receive events.

### Rotate `CRON_SECRET`

1. Generate a new high-entropy random value.
2. Update `CRON_SECRET` in Vercel for the environment.
3. Update the scheduled trigger configuration to send an `Authorization` bearer header containing the new secret.
4. Redeploy if required by the platform.
5. Verify `/api/digest` returns 401 without the bearer and succeeds with the new bearer.
6. Delete the old secret from any scheduler, runbook, or password manager entry.

## Incident and leak response

Use this checklist for any suspected committed, logged, or exposed secret:

1. **Contain**
   - Remove public access to the leaked value if possible.
   - Disable affected webhook endpoints, cron triggers, or API keys when safe.
2. **Revoke and rotate**
   - Rotate the provider secret using the runbook above.
   - Update Vercel env vars for every affected environment.
   - Redeploy and verify health before revoking any credential still needed by a live deployment.
3. **Invalidate sessions or derived access**
   - For Clerk exposure, invalidate affected sessions and review user/account events.
   - For Stripe exposure, review API events and webhook deliveries.
   - For unlisted recipe-link exposure, use the owner share-link rotation/revocation flow.
4. **Audit**
   - Run Gitleaks locally or in CI against the affected branch/commit range.
   - Review provider audit logs and app `audit_log` entries for suspicious changes.
   - Check Git history for whether the value was ever pushed.
5. **Repair**
   - Remove the secret from source, logs, issue comments, screenshots, and documentation.
   - Add tests or secret-scan allowlist tightening only when the gap was in detection.
6. **Document**
   - Record timeline, impact, rotated keys, affected environments, and follow-up actions in the private incident tracker.

_Related issue: #267._
