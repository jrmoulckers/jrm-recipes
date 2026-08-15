# Processor register

Record of every third party that receives personal data from Heirloom: what it gets, why, and
under what safeguard. This is the Art. 30(1)(d) record of recipients, and it is the factual input
to the user-facing privacy notice, which cannot be written honestly without it.

This register is the evidence behind
[`PROD-COMP-004` (Decide residency and transfer bounds before launch)](https://github.com/jrmoulckers/product/blob/3a752c11856515a74eb204675d5d5198cac1e48e/principles/compliance.md),
which requires approved processors, transfer conditions, and disclosure outcomes for each data
category before launch or material change. An unmatched subprocessor or transfer blocks readiness,
which is why an undocumented recipient is treated as undisclosed below. The citation is pinned to a
commit rather than `main` because this is a compliance artifact and the exact obligation wording
matters.

**This is not `docs/secrets-management.md`.** That file tracks where credentials live and who
rotates them, which is a security-operations concern. A credential can be perfectly managed while
the data it unlocks flows somewhere undisclosed. The two documents overlap in the services they
name and answer different questions, so neither substitutes for the other.

## How this list was built, and how to rebuild it

Derived from the **code**, not from `package.json`. That distinction is load-bearing:

**Resend has no SDK dependency.** It is called by raw `fetch` against `https://api.resend.com/emails`
(`src/server/digest/email.ts`), so it appears in no dependency manifest and any inventory built by
reading dependencies will miss it entirely. It went undocumented for exactly this reason.

So when re-deriving this register, search for outbound network calls and credential names, not
packages:

```bash
rg -n 'https?://[a-z0-9.-]+\.(com|io|dev|tech)' src --glob '!*.test.*'
rg -n 'process\.env\.|env\.[A-Z_]+' src/env.js
```

Any host that is not our own domain is a candidate recipient. Treat a new entry as undisclosed
until it is added here.

## Register

| #   | Processor      | Purpose                                             | Personal data it receives                                                                                                                                                                              | Conditional on                                        | Reached from                                               |
| --- | -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------- |
| 1   | **Clerk**      | Identity, authentication, account lifecycle         | Email address, name, avatar image, authentication events, and the Clerk user id                                                                                                                        | `CLERK_SECRET_KEY` (dev falls back to a local bypass) | `@clerk/nextjs` middleware; `src/server/auth/index.ts`     |
| 2   | **Neon**       | Primary Postgres database                           | Everything the product stores, including recipe free text, which is unbounded user-authored content and must be assumed to contain personal data about the author and about third parties they mention | `DATABASE_URL`                                        | `src/server/db/**`                                         |
| 3   | **Vercel**     | Application hosting and edge network                | Request metadata, IP addresses, user agents, and runtime logs                                                                                                                                          | Always in production                                  | Platform, see `DEPLOY.md`                                  |
| 4   | **Cloudinary** | Image upload, storage, transformation, CDN delivery | User-uploaded photographs and avatars. Images may contain identifiable faces and embedded EXIF metadata, so they are personal data beyond the file itself                                              | `CLOUDINARY_API_SECRET`                               | `src/app/api/cloudinary/sign/route.ts`; `next-cloudinary`  |
| 5   | **Stripe**     | Subscription billing                                | **Email address and name**, plus our internal `userId` in customer metadata, plus payment details collected by Stripe directly                                                                         | `STRIPE_SECRET_KEY`                                   | `src/server/billing/actions.ts`, `stripe.customers.create` |
| 6   | **PostHog**    | Product analytics                                   | Internal user id as the distinct id, plus deliberately non-PII event properties. Recipe content and personal details are excluded by design                                                            | `NEXT_PUBLIC_POSTHOG_KEY`                             | `src/lib/analytics/**`                                     |
| 7   | **Resend**     | Transactional and digest email                      | Recipient email address, message subject, and the **full message body**, which for the weekly digest includes the user's own recipe titles                                                             | `RESEND_API_KEY`                                      | `src/server/digest/email.ts`                               |

Entries 1, 4, 5, 6 and 7 are **conditional**: unset the credential and the integration silently
degrades rather than failing. This means a staging or preview environment can have a materially
different recipient list from production. When answering "who has this user's data", answer for the
environment the user was actually in.

## Notes that change the risk, per processor

### Neon (2) is the widest exposure

Recipe story, notes and step text are free-form prose. Users write about family members, health
conditions and places. No schema constrains this, so the database must be treated as containing
special-category data even though no column is labelled as such. This is the same property that
makes erasure hard rather than a matter of nulling a column, and it is why account deletion is full
deletion rather than anonymisation. See `docs/architecture/0004-account-erasure.md`.

Backup copies extend this beyond the live database. See `docs/db-backup-and-recovery.md`.

### PostHog (6) defaults to a US ingestion host

`.env.example` documents the default as `https://us.i.posthog.com`, with
`https://eu.i.posthog.com` available. **The default is a US transfer.** Whichever host is
configured in production is the one that governs, so confirm the deployed value rather than
assuming the default, and record it below once confirmed.

Analytics is consent-gated and cookieless, and event properties are scrubbed before dispatch
(`src/lib/analytics/**`). The scrub is a guard, not a proof: **#705** is open to move scrubbing into
`before_send` so that it also covers properties added by code paths that bypass the typed `track`
API. Until that lands, treat "PostHog receives no PII" as an intent enforced in most places rather
than an invariant.

### Resend (7) receives message bodies, not just addresses

The digest is assembled from the user's own content, so the message body is personal data in
transit through a third party, not merely an address. Additionally, `DEFAULT_FROM` in
`src/server/digest/email.ts` is `onboarding@resend.dev` — a Resend-owned shared sandbox domain used
when `EMAIL_FROM` is unset. Production must set `EMAIL_FROM` to a verified own domain; otherwise
mail is sent from a domain we do not control.

### Stripe (5) is a controller in its own right

Stripe determines its own purposes for fraud prevention and regulatory record-keeping, so for parts
of the relationship it is a **controller**, not a processor acting on our instructions. That changes
which contractual terms apply and what a user's deletion request can achieve: financial records are
commonly subject to a statutory retention period that overrides erasure. This must be reflected in
the deletion notice.

## Gaps requiring a human

These are contractual and organisational facts that do not exist anywhere in this repository, so
they cannot be derived from the code. They are listed unfilled on purpose. **An empty cell is
honest; a plausible-looking invented one is a compliance liability**, because a register is relied
on precisely when someone is checking whether a claim was true.

| Gap                                                                  | Why it cannot be answered from the codebase               | Owner              |
| -------------------------------------------------------------------- | --------------------------------------------------------- | ------------------ |
| Whether a **DPA** is executed with each of the seven                 | Contract status is not in the repo                        | Legal / operations |
| **Sub-processors** used by each                                      | Published on their sites and versioned by them, not by us | Legal / operations |
| **International transfer mechanism** (SCCs, adequacy) per processor  | Contractual; note PostHog's default host is US            | Legal              |
| **Hosting region actually configured** for Neon, Cloudinary, PostHog | Deployment configuration, not source                      | Operations         |
| **Retention** each processor applies independently of ours           | Their policy, and it can outlive our deletion             | Legal / operations |
| Whether **Stripe's controller-side retention** is disclosed to users | Depends on the above                                      | Legal              |

Filling these is prerequisite to publishing a privacy notice, since Art. 13 requires disclosing
recipients and transfer safeguards, and neither is currently established.

## Maintenance

Re-derive rather than amend. This register is a **cache of what someone once found**, and its
errors of omission are invisible: a stale row at least gets re-read, but a processor that never
entered the list is never reconsidered. Resend is the proof.

Re-derive when adding any outbound integration, and as part of the quarterly review in
`docs/secrets-management.md`.

_Related issues: #678, #705, #814. Related docs: `docs/secrets-management.md`,
`docs/db-backup-and-recovery.md`, `docs/architecture/0004-account-erasure.md`._
