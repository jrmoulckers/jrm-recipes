# Security Policy

**This policy extends the JRM Studio org-wide security policy at
[`jrmoulckers/.github/SECURITY.md`](https://github.com/jrmoulckers/.github/blob/main/SECURITY.md).**
Heirloom inherits every principle, prohibition, and safe-harbor commitment in that canonical
document. This file adds the product-specific detail that the central policy cannot carry: the
Heirloom threat model, the assets we protect, the mitigations that exist in this repository today,
and the secrets-handling policy. Where this file is silent, the canonical policy governs. The small
number of places where Heirloom deliberately differs from canon are listed in
[Deliberate deviations from the canonical policy](#deliberate-deviations-from-the-canonical-policy).

Heirloom is a family-recipe PWA. Its security posture is centered on protecting private family
recipes, account access, billing state, uploaded media, and the Postgres database that stores family
history. This document is intentionally grounded in the repository as it exists today;
deployment-provider details not present in the repo are called out as deployment-dependent.

## Supported Versions

Heirloom is a continuously deployed application rather than a versioned library, so it follows a
rolling support model instead of the canonical release-line model:

| Version or branch                                          | Supported                          |
| ---------------------------------------------------------- | ---------------------------------- |
| Deployed `main` branch                                     | :white_check_mark: Active          |
| Older commits, forks, local branches, or archived releases | :x: Upgrade to the deployed `main` |

Security fixes are made against `main` and deployed through the normal Vercel production flow.

## Reporting a Vulnerability

> **Do not open a public GitHub issue, pull request, or discussion for security vulnerabilities.**
>
> Public disclosure before a fix is available can put users and their private family recipes at
> risk.

### Preferred: GitHub Private Vulnerability Reporting

1. Open this repository's **Security** tab.
2. Go to **Advisories**.
3. Choose **Report a vulnerability**.
4. Include the details listed in [What to Include](#what-to-include).

### Alternative: Private Contact Placeholder

If private vulnerability reporting is unavailable, contact the maintainer privately through the
repository owner's GitHub profile.

Placeholder contact: `security@<your-domain>` (**to configure before launch**).

Use the subject line:

```text
[SECURITY] jrm-recipes — <brief description>
```

Do not send secrets, exploit code against third-party systems, or real user data — including real
family recipe content or other users' account data — in an initial message. Request a secure channel
if sensitive details are required.

## What to Include

Please include enough information for maintainers to understand and reproduce the issue:

- **Summary** — clear description of the vulnerability
- **Affected component** — route handler, server action, query/mutation module, schema, workflow,
  page, or service integration (Clerk, Stripe, Cloudinary, PostHog)
- **Reproduction steps** — minimal steps to demonstrate the issue
- **Proof of concept** — snippets, screenshots, or logs with sensitive data redacted
- **Impact** — what an attacker could achieve, especially any cross-user or cross-group recipe
  access
- **Severity estimate** — Critical, High, Medium, or Low
- **Environment** — browser, installed-PWA vs browser tab, deployment environment (production or
  preview), and whether a service worker was active
- **Suggested fix** — optional, but appreciated

## Severity Guide

Heirloom uses the canonical severity guide, with product-specific examples:

| Severity     | Examples                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical** | Remote code execution, Clerk authentication bypass, `DATABASE_URL` or webhook-secret extraction, broad unauthorized access to private recipes across accounts                         |
| **High**     | Privilege escalation within a group, stored cross-site scripting in recipe content, exploitable injection through recipe/import input, forged Clerk or Stripe webhooks mutating state |
| **Medium**   | Limited data exposure such as unlisted share-token leakage, cross-site request forgery with user interaction, insecure defaults with a realistic exploit path                         |
| **Low**      | Minor information disclosure, hardening gaps, security-relevant misconfiguration with limited impact                                                                                  |

## What Not to Do

- Do not publicly disclose details before a fix or advisory is available.
- Do not exploit beyond the minimum necessary to demonstrate impact.
- Do not access, modify, delete, or exfiltrate data that is not yours — this explicitly includes
  other families' recipes, comments, cook logs, and meal plans.
- Do not attack third-party services (Clerk, Stripe, Cloudinary, PostHog, Vercel), production
  systems, CI infrastructure, or other users.
- Do not perform denial-of-service testing.
- Do not perform privacy-invasive testing, data destruction, persistence, or social engineering.
- Do not share vulnerability details with third parties before coordination is complete.

## Response Timeline

Heirloom is maintained as an independent effort. These are target timelines, not guarantees:

| Stage                     | Target                                  |
| ------------------------- | --------------------------------------- |
| Acknowledgment            | Within 3 business days                  |
| Initial assessment        | Within 1 week                           |
| Critical or High fix plan | As soon as practical after confirmation |
| Medium or Low fix plan    | Next appropriate maintenance cycle      |

Triage covers severity, affected assets, reproduction steps, and likely remediation. Maintainers
follow up through the same private channel used for the report, and keep the reporter updated during
remediation — especially for high-impact issues.

## Coordinated Disclosure

We follow coordinated disclosure:

1. Validate the report and scope.
2. Develop and test a fix.
3. Publish a security advisory or release notes when appropriate.
4. Credit the reporter unless anonymity is requested.

Please allow up to 90 days from the initial report before public disclosure, unless active
exploitation or user-risk reduction requires a different timeline.

## Scope

In-scope reports generally include:

- Authentication or authorization bypasses, including cross-user or cross-group recipe access
- Unlisted share-link token leakage, guessing, or failure to honor revocation
- Injection vulnerabilities
- Cross-site scripting or request forgery with meaningful impact
- Content Security Policy or security-header weaknesses that materially increase blast radius
- Service-worker caching that could serve one viewer's authorized recipe content to another
- Secret exposure or insecure credential handling
- Insecure cryptography or key management
- Sensitive data exposure in logs, artifacts, builds, or APIs
- Webhook signature-verification weaknesses in the Clerk or Stripe webhook routes
- Dependency or supply-chain vulnerabilities exploitable in this repository's usage
- CI/CD, migration, or release workflow vulnerabilities that could alter trusted outputs or mutate
  production data

Out-of-scope reports generally include:

- Social engineering of users or maintainers
- Denial-of-service against local development, CI, or hosted services
- Issues only affecting unsupported versions, forks, or local branches
- Best-practice suggestions without a demonstrated exploit path
- UI/UX bugs without security impact
- Vulnerabilities in upstream dependencies with no repository-specific exploitability
- Findings that depend on setting `NEXT_PUBLIC_DEV_AUTH_BYPASS=1` or `SKIP_ENV_VALIDATION=1`, which
  are local/CI-only controls that fail closed in deployed environments
- Attacks requiring physical access to an unlocked, authenticated device
- Self-XSS requiring a user to paste code into their own console

## Safe Harbor

Heirloom supports good-faith security research. We will not pursue legal action against researchers
who:

- Follow this policy and report through private channels
- Avoid privacy violations, data destruction, and service disruption
- Access only systems and data they are authorized to use
- Give maintainers reasonable time to fix before disclosure

Good-faith security research that follows this process and avoids harming users or data will not be
treated as unauthorized activity by the project maintainers. If you are unsure whether research is in
scope, contact maintainers privately before proceeding.

## Heirloom Threat Model

This section is specific to jrm-recipes and has no counterpart in the canonical policy.

### Assets

- **Family recipes and history:** recipe content, stories, private/group/unlisted visibility, version
  history, comments, ratings, cook logs, meal plans, and shopping data.
- **User accounts:** Clerk-backed identities mirrored into the app database.
- **Billing data:** Stripe customer, subscription, gift, and webhook-derived billing state. Card data
  is handled by Stripe-hosted Checkout and Customer Portal flows, not by this app.
- **Uploaded media:** recipe images and videos stored/delivered through Cloudinary when configured.
- **Postgres database:** the `DATABASE_URL`-backed Postgres instance accessed through Drizzle ORM.
- **Analytics telemetry:** optional PostHog product analytics when a deploy supplies
  `NEXT_PUBLIC_POSTHOG_KEY`.
- **Operational secrets:** database credentials, Clerk/Stripe/Cloudinary server secrets, webhook
  signing secrets, and cron trigger secrets.

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

## Secrets-Handling Policy

This section is specific to jrm-recipes and has no counterpart in the canonical policy.

Secrets must be stored in deployment environment variables, not in source. For the current Vercel
deployment model, store them in Vercel project environment variables separately for Production,
Preview, and any staging environment.

See [`docs/secrets-management.md`](docs/secrets-management.md) for:

- the actual environment-variable categories used by this repo;
- owner and rotation templates;
- provider-specific rotation runbooks;
- leak-response steps; and
- the Stripe `plans.ts` convention that keeps Price IDs in environment variables rather than
  committed source.

## Deliberate deviations from the canonical policy

Heirloom intentionally differs from
[the canonical policy](https://github.com/jrmoulckers/.github/blob/main/SECURITY.md) in the
following places. Everything else is inherited unchanged.

| Area                  | Canonical policy                                                | Heirloom behavior                                         | Rationale                                                                                                                               |
| --------------------- | --------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Supported Versions    | Default branch plus the latest actively maintained release line | Deployed `main` only; no supported release lines          | Heirloom is a continuously deployed application, not a released library, so there is no older release line that can receive a backport. |
| Acknowledgment target | Within 48 hours                                                 | Within 3 business days                                    | Single-maintainer capacity; a business-day target is one this project can actually meet rather than an aspirational clock-hour target.  |
| Contact placeholder   | `security@example.com` (replace before use)                     | `security@<your-domain>` (**to configure before launch**) | Heirloom's placeholder is deliberately non-deliverable so it cannot be mistaken for a live inbox before launch configuration happens.   |

The canonical policy explicitly allows product repositories to add stricter project-specific
guidance. If any deviation above should instead become the studio-wide default, raise it in
`jrmoulckers/.github` rather than editing this file in isolation.
