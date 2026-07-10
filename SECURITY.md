# Security policy

Heirloom is a family-recipe PWA. Its security posture is centered on protecting private family recipes, account access, billing state, uploaded media, and the Postgres database that stores family history.

This document describes the supported version, vulnerability reporting process, threat model, and where to find the secrets-management policy. It is intentionally grounded in the repository as it exists today; deployment-provider details not present in the repo are called out as deployment-dependent.

## Supported versions

Heirloom follows a rolling support model:

| Version                                                    | Supported |
| ---------------------------------------------------------- | --------- |
| Deployed `main` branch                                     | Yes       |
| Older commits, forks, local branches, or archived releases | No        |

Security fixes should be made against `main` and deployed through the normal Vercel production flow.

## Reporting a vulnerability

Please do not open a public GitHub issue for suspected vulnerabilities.

Use one of these private channels instead:

1. **Preferred:** Open a private GitHub Security Advisory for this repository.
2. **Fallback:** Email `security@<your-domain>` (**to configure before launch**).

Coordinated disclosure process:

1. We will acknowledge a valid report within **3 business days**.
2. We will triage severity, affected assets, reproduction steps, and likely remediation.
3. We will keep the reporter updated during remediation, especially for high-impact issues.
4. We target coordinated public disclosure within **90 days**, unless active exploitation or user-risk reduction requires a different timeline.
5. We ask reporters to avoid privacy-invasive testing, data destruction, persistence, social engineering, and public disclosure before remediation.

Safe harbor: good-faith security research that follows this process and avoids harming users or data will not be treated as unauthorized activity by the project maintainers.

## Threat model

### Assets

- **Family recipes and history:** recipe content, stories, private/group/unlisted visibility, version history, comments, ratings, cook logs, meal plans, and shopping data.
- **User accounts:** Clerk-backed identities mirrored into the app database.
- **Billing data:** Stripe customer, subscription, gift, and webhook-derived billing state. Card data is handled by Stripe-hosted Checkout and Customer Portal flows, not by this app.
- **Uploaded media:** recipe images and videos stored/delivered through Cloudinary when configured.
- **Postgres database:** the `DATABASE_URL`-backed Postgres instance accessed through Drizzle ORM.
- **Analytics telemetry:** optional PostHog product analytics when a deploy supplies `NEXT_PUBLIC_POSTHOG_KEY`.
- **Operational secrets:** database credentials, Clerk/Stripe/Cloudinary server secrets, webhook signing secrets, and cron trigger secrets.

### Realistic threats and current mitigations

| Threat                                                                    | Current mitigations evidenced in the repo                                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthorized access to private or group recipes                           | `src/server/recipes/queries.ts` enforces per-viewer access through `canView`, group membership checks, and `getRecipe`. Public feeds only return `public` + `published` recipes.                                                                     |
| Unlisted recipe link leakage                                              | Unlisted recipes are not public by slug/id. `getRecipeByShareToken` only resolves enabled unlisted links with the stored token, and owner-only share-link rotation/revocation is implemented in `src/server/recipes/mutations.ts`.                   |
| Shared family kitchen tablet showing one user's private recipe to another | `src/app/sw.ts` deliberately uses `NetworkFirst` for recipe pages because recipe HTML is per-viewer and access-controlled. It avoids serving stale authorized recipe pages before the network on shared browser profiles.                            |
| Deployed auth accidentally falling back to the shared dev user            | `src/env.js`, `src/server/auth/index.ts`, and `src/middleware.ts` fail closed in production/deployed contexts when Clerk keys are missing or `NEXT_PUBLIC_DEV_AUTH_BYPASS=1`.                                                                        |
| Web spoofing/clickjacking/XSS blast radius                                | `src/lib/security/headers.ts` applies a nonce-based CSP with `strict-dynamic`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS, `nosniff`, a conservative referrer policy, and a locked-down permissions policy through `src/middleware.ts`. |
| Malicious or malformed recipe input                                       | `src/server/recipes/validation.ts` uses Zod schemas for recipe, ingredient, step, media URL, visibility, status, and numeric bounds. Several invariants are mirrored with Drizzle/Postgres `CHECK` constraints in `src/server/db/schema/recipes.ts`. |
| Arbitrary media-host tracking through stored recipe images/videos         | When Cloudinary is configured, recipe media URLs are restricted by `src/server/recipes/validation.ts` to the configured media allowlist that also backs Next image configuration.                                                                    |
| Destructive recipe deletion losing family history                         | Recipes are soft-deleted with `deletedAt`/`deletedBy` tombstones in `src/server/db/schema/recipes.ts` and `src/server/recipes/mutations.ts`; read paths filter tombstones while preserving versions/events/ratings/comments for restore.             |
| Sensitive authorization changes lacking investigation history             | `src/server/audit.ts` and `src/server/db/schema/audit.ts` record a best-effort append-only audit trail for group membership/role changes, ownership transfer, group deletion, recipe deletion, visibility changes, and share-link changes.           |
| Spoofed webhooks                                                          | Clerk webhooks verify Svix signatures against `CLERK_WEBHOOK_SECRET` in `src/app/api/webhooks/clerk/route.ts`. Stripe webhooks verify `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` in `src/app/api/stripe/webhook/route.ts`.                   |
| Secret leakage in source control                                          | `.gitignore` excludes `.env`, `.env*.local`, `.vercel`, and `.clerk/`. `.github/workflows/ci.yml` runs a Gitleaks secret scan, and `.gitleaks.toml` keeps the default ruleset with a narrow test-fixture allowlist.                                  |
| Dependency or CI supply-chain issues                                      | `.github/workflows/ci.yml` includes a dependency audit, SHA-pinned third-party actions, least-privilege job permissions, and Dependabot is configured for npm and GitHub Actions updates.                                                            |
| Preview deploys mutating production schema                                | `scripts/migrate.mjs` skips migrations on `VERCEL_ENV=preview` unless `ALLOW_PREVIEW_MIGRATIONS=1` is explicitly set for an isolated preview database.                                                                                               |

## Secrets-handling policy

Secrets must be stored in deployment environment variables, not in source. For the current Vercel deployment model, store them in Vercel project environment variables separately for Production, Preview, and any staging environment.

See [`docs/secrets-management.md`](docs/secrets-management.md) for:

- the actual environment-variable categories used by this repo;
- owner and rotation templates;
- provider-specific rotation runbooks;
- leak-response steps; and
- the Stripe `plans.ts` convention that keeps Price IDs in environment variables rather than committed source.
