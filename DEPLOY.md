# Deploying Heirloom

This is the **one-time setup** to take Heirloom live. After this, every merge to
`main` auto-deploys and runs database migrations for you.

You'll provision three services (all have generous free tiers), paste their keys
into Vercel, and connect the repo. Budget ~20 minutes.

- [Neon](https://neon.tech): serverless Postgres database
- [Clerk](https://clerk.com): authentication
- [Cloudinary](https://cloudinary.com): image/video storage & delivery
- [Vercel](https://vercel.com): hosting + CI/CD

> **Clerk is required for any deployed environment (preview or production).** The
> app fails closed: a deploy that would fall back to dev-bypass auth, no Clerk
> keys, or `NEXT_PUBLIC_DEV_AUTH_BYPASS=1`, refuses to build/boot (production) or
> to serve requests (preview), so set the Clerk keys before you deploy. Dev-bypass
> (a single shared local user) is strictly a **local/test** affordance. Neon
> (Postgres) backs your real data. Cloudinary stays optional. Without it, photo
> fields fall back to pasting an image URL, so add it whenever you want native
> drag-and-drop / camera uploads, with no code changes.

---

## 1. Database: Neon

1. Create a Neon account and a new **Project** (pick a region near your users).
2. In the project dashboard, open **Connection Details**.
3. Copy the **pooled** connection string (it contains `-pooler` in the host).
   It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/DB?sslmode=require
   ```
4. Save it. This is your **`DATABASE_URL`**.

> Heirloom's Postgres client uses `prepare: false` and a small pool, which is
> exactly what Neon's pooled endpoint wants. Migrations run automatically on
> deploy, so you don't need to run anything by hand.

---

## 2. Authentication: Clerk

1. Create a Clerk account and a new **Application**. Enable whichever sign-in
   methods you want (email, Google, etc.).
2. From **API Keys**, copy:
   - **Publishable key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret key** → `CLERK_SECRET_KEY`
3. (Optional) If you host at a custom domain, add it to Clerk's allowed origins.

Heirloom uses Clerk's **modal** sign-in and sign-up (a popup. There is no
dedicated `/sign-in` page), so you can leave `NEXT_PUBLIC_CLERK_SIGN_IN_URL` /
`..._SIGN_UP_URL` unset. The two keys above are all you need.

---

## 3. File storage: Cloudinary

1. Create a [Cloudinary](https://cloudinary.com) account. Your **Cloud name** is
   shown on the dashboard.
2. Open **Settings → API Keys** and copy the **API Key** and **API Secret**.
3. You'll set three env vars in step 4:
   - **`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`**: your cloud name
   - **`NEXT_PUBLIC_CLOUDINARY_API_KEY`**: the API key (public, client-safe)
   - **`CLOUDINARY_API_SECRET`**: the API secret (server-only, used to sign
     uploads so the browser never sees it)

> Optional for launch. When these are unset, every photo field (recipe cover +
> each step) shows a plain "paste an image URL" input. Set all three and the same
> fields upgrade to drag-and-drop, camera, and direct-URL uploads. No code
> changes, no redeploy of the app needed beyond adding the vars.

---

## 3b. Billing: Stripe (optional)

Heirloom is fully usable on the **Free** tier with no billing configured. The
pricing page renders read-only and upgrade buttons are disabled. Add Stripe to
sell the Family/Premium plan.

1. Create a [Stripe](https://stripe.com) account and, in **Test mode**, copy the
   **Secret key** and **Publishable key** from the Developers → API keys page.
2. Create a recurring **Product/Price** for Family and copy its **Price ID**
   (`price_…`).
3. After your first deploy, add a webhook endpoint pointing at
   `https://<your-domain>/api/stripe/webhook` (events:
   `checkout.session.completed`, `customer.subscription.*`,
   `invoice.payment_failed`) and copy its **Signing secret** (`whsec_…`).
4. Set the env vars in step 4:
   - **`STRIPE_SECRET_KEY`**: server-only secret key
   - **`STRIPE_WEBHOOK_SECRET`**: the webhook signing secret
   - **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`**: the publishable key (client-safe)

> Optional. When unset, the whole billing layer degrades to a no-op: nobody can
> be charged, and every feature that isn't limit-gated stays available.

---

## 4. Deploy: Vercel

1. Push this repo to GitHub (if it isn't already).
2. In Vercel, **Add New… → Project** and **import** the repo. Vercel auto-detects
   Next.js. Leave the framework preset as **Next.js**.
   - Do **not** override the Build Command. The repo ships a `vercel-build`
     script that runs database migrations and then `next build`. Vercel uses it
     automatically.
3. Under **Environment Variables**, add the values you collected (see the table
   below). Add them to **Production**. For **Preview**, do **not** reuse the
   production `DATABASE_URL`. See [Isolating preview
   databases](#isolating-preview-databases) below.
4. Click **Deploy**.

That's it. On this and every future deploy, Vercel will run the migrations
against Neon and build the app.

### Quota policy activation

**Prepared for review, not operationally activated.** See
[ADR-0013](docs/architecture/0013-on-demand-bug-bash-releases.md) and the
[on-demand release procedure](docs/bug-loop.md#on-demand-bug-bash-releases).
No quota recovery is established by this change.

The repository config uses Vercel's documented
[`git.deploymentEnabled`](https://vercel.com/docs/project-configuration/git-configuration):
`{"**": false, "main": true}`. Unspecified branches default to enabled, and
any matching `true` wins. Globstar covers slash-separated fix/release branches;
a single `*` is not a catch-all for those names under minimatch semantics.
`main` remains enabled as the production target. This suppresses automatic Git
deployments, not just an ignored build step; it does not block explicit
deployments, dashboard actions or existing queued work.

**First-publication gate:** the branch-matching reference does not explicitly
establish which revision supplies configuration before the first deployment
allocation. Do not infer bootstrap safety from a local config test. Hold the
initial push/PR until that behavior is established for the connected project,
or a human approves and confirms an independent Git-deployment stop.
Vercel documents **Settings > Git > Connected Git Repository > Disconnect**
in its [Git settings](https://vercel.com/docs/project-configuration/git-settings).
That is a possible human-controlled bootstrap option, not an instruction to
execute it: identify every connected project first, review outstanding work,
and separately authorize reconnection and any deployment it might cause.
An ignored build step is not a substitute for stopping deployment allocation.

Before activation, a human must:

1. Inspect Vercel's actual exhausted resource and resumption requirements. Do not
   assume a calendar reset, or probe paused production to check whether it lifted.
2. Review and authorize merging this deployment-affecting policy PR. It may
   itself trigger a main deployment. Confirm the project production branch is
   `main` and review any project/root-directory overrides that change which
   configuration Vercel reads. No settings changes are performed by this PR.
3. Reconcile outstanding/older fix and bot branches **before their next push**:
   they may carry the old configuration. The policy does not retroactively
   rewrite them or cancel queued deployments. If safe source-commit suppression
   cannot be established, hold publication and obtain approval for the needed
   dashboard Git-deployment control first; never test safety with a real push.
4. Authorize the named integration branch, release owner, selected peer-PR
   integration operations and batch release. Until then this is a proposal,
   not permission to change shared branches or deploy.
5. After an authorized release and hosting availability, inspect the central
   watcher receipt and collect each bug's no-retry browser acceptance on that
   SHA. A health GET proves neither UI correctness nor recovery of the quota.

Once merged, the workflows have no warming/hourly schedules. The manual
connectivity workflow makes one request with a 30-second ceiling and accepts
HTTP 200 only; it is not release acceptance. Deploy watch makes one such request
per successful Production event and requires exact SHA, `status=ok`, `db=ok`.
Its manual drift fallback compares against checked-out `main` with the same
health requirements; an in-flight deployment defers verification. Each event
or deliberate rerun is a separate invocation, not a globally once-only check.
Failed-deployment diagnostics retain their GitHub API queries and do not probe
production. All five existing business/privacy crons remain unchanged.

### Environment variables

| Variable                             | Required?       | Value                                                                                                                                                                                                           |
| ------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                       | **Yes**         | Neon **pooled** connection string (step 1)                                                                                                                                                                      |
| `NEXT_PUBLIC_APP_URL`                | **Yes**         | Your public site URL, e.g. `https://heirloom.yourdomain.com`                                                                                                                                                    |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | For auth        | Clerk publishable key                                                                                                                                                                                           |
| `CLERK_SECRET_KEY`                   | For auth        | Clerk secret key                                                                                                                                                                                                |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`  | For uploads     | Cloudinary cloud name                                                                                                                                                                                           |
| `NEXT_PUBLIC_CLOUDINARY_API_KEY`     | For uploads     | Cloudinary API key (public)                                                                                                                                                                                     |
| `CLOUDINARY_API_SECRET`              | For uploads     | Cloudinary API secret (server-only)                                                                                                                                                                             |
| `STRIPE_SECRET_KEY`                  | For billing     | Stripe secret key (server-only)                                                                                                                                                                                 |
| `STRIPE_WEBHOOK_SECRET`              | For billing     | Stripe webhook signing secret for `/api/stripe/webhook`                                                                                                                                                         |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | For billing     | Stripe publishable key (public, client-safe)                                                                                                                                                                    |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`      | Optional        | Defaults to `/sign-in`                                                                                                                                                                                          |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`      | Optional        | Defaults to `/sign-up`                                                                                                                                                                                          |
| `NEXT_PUBLIC_DEV_AUTH_BYPASS`        | Never (deploys) | Local/test-only. Forces dev-bypass auth. **Any deploy, preview or production, with this set to `1` (or with Clerk keys missing) fails closed** (production at build/boot, preview per request), leave it unset. |

> Set `NEXT_PUBLIC_APP_URL` to your real domain so share links and PWA metadata
> are correct.

> **Production deploy preflight (`scripts/preflight-env.mjs`).** Because every
> variable above is technically optional (so local/CI/preview can boot with zero
> config), production deploys run a preflight check _before_ migrations and the
> build. When `VERCEL_ENV=production`, it fails the deploy fast with an
> actionable message unless all of these are present and well-formed:
>
> - `DATABASE_URL`: a `postgres://` / `postgresql://` URL
> - `NEXT_PUBLIC_APP_URL`: an absolute `http(s)` URL
> - `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
> - `NEXT_PUBLIC_DEV_AUTH_BYPASS` **must not** be `1`
>
> Local, CI, and preview builds skip the check entirely, so zero-config runs are
> unaffected.

### Isolating preview databases

Automatic non-main Git deployments are disabled by the proposed quota policy.
The guidance below applies only to explicitly approved hosted previews; it is
not an instruction to enable them for each bug.

Vercel runs `vercel-build` for **preview** deployments too, and a preview shares
the project's environment variables. If you add the production `DATABASE_URL` to
the Preview environment, a PR's build would run schema **migrations against the
production database**. At best noisy, at worst destructive. Never do this.

Instead, give previews their own throwaway database:

- **Recommended. Neon branching.** Install the [Neon–Vercel
  integration](https://neon.tech/docs/guides/vercel) and enable "Create a
  database branch for each preview". Neon injects a per-PR branch `DATABASE_URL`
  into the Preview environment automatically and deletes the branch when the PR
  closes, so previews get an isolated copy of the schema/data.
- **Or leave Preview with no `DATABASE_URL`.** The app boots read-degraded and
  `scripts/migrate.mjs` skips (it exits 0 when no URL is set), which is safe if
  you don't need a working database in previews.

As a defense-in-depth guardrail, `scripts/migrate.mjs` **refuses to migrate from
a preview deploy** (`VERCEL_ENV=preview`) unless you explicitly opt in with
`ALLOW_PREVIEW_MIGRATIONS=1`, so even a misconfigured Preview `DATABASE_URL`
cannot mutate production schema by accident. Set that flag only once you've
confirmed the Preview `DATABASE_URL` points at an isolated per-branch database.

---

## 5. Verify

Once the deploy is green, open your site and confirm:

- [ ] The landing page loads and you can switch between the five themes.
- [ ] The accessibility panel (header) toggles text size / contrast / motion.
- [ ] You can sign in (if Clerk is configured).
- [ ] You can **create a recipe**, see it in your library, edit, and delete it.
      _(This confirms the database + migrations worked.)_
- [ ] **Cook mode** opens and timers/scaling work.
- [ ] On mobile, you can **install** the app (Add to Home Screen) and it shows
      the offline page when you go offline after visiting once.

---

## 6. Going further (optional)

Nice-to-haves you can do any time after you're live. None are required.

### Point a custom domain at the site

1. Vercel → your project → **Settings → Domains** → add your domain
   (a subdomain like `heirloom.yourdomain.com` is simplest. The apex
   `yourdomain.com` also works).
2. Vercel shows the **exact** DNS records to create. Because this domain's DNS is
   at your registrar (not Vercel), add them there. Always use the values Vercel
   displays, but they're typically:
   - **Subdomain** → a **CNAME** to `cname.vercel-dns.com`.
   - **Apex/root** → an **A** record to the IP Vercel lists (e.g. `76.76.21.21`).
3. Wait for Vercel to verify. DNS propagation can take longer).
4. Update **`NEXT_PUBLIC_APP_URL`** to the new URL and redeploy so share links,
   Open Graph tags, and PWA metadata are correct.
5. If Clerk is enabled, also add the domain under Clerk → **Domains**.

### Promote Clerk from development to production

Clerk's `pk_test_…` / `sk_test_…` keys are a **development** instance, fine for
family testing, but they show a dev banner and have lower limits.

1. In Clerk, create a **Production** instance for the app (Clerk walks you
   through it). Production requires a domain.
2. Add your custom domain and create the DNS records Clerk lists (typically a
   `CNAME clerk.yourdomain.com → …`, plus DKIM/email records if you send mail
   from your domain).
3. Copy the new **production** keys (`pk_live_…`, `sk_live_…`).
4. In Vercel, replace `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
   (Production environment) with the live keys and redeploy.

### Seed a little demo content (optional)

Want the site to feel alive before anyone adds recipes? Point `DATABASE_URL` at
your database and run the seed once:

```
pnpm db:seed
```

It creates a demo cook, a "family" group, and three sample recipes (all
idempotent and safe to run twice. Delete them from the UI any time).

### Test a bug-bash release before production

Use the [isolated batch procedure](docs/bug-loop.md#on-demand-bug-bash-releases),
local production builds and GitHub CI, not a permanent staging deployment.
The presence of `staging` in a CI trigger does not establish an existing remote
branch. A hosted preview is an explicit human-approved exception with its own
quota budget and isolated database; the main-only Git policy does not enable it.

### Automated releases (versioning & changelog)

Versioning, the changelog, and release tags are automated with
[release-please](https://github.com/googleapis/release-please)
(`.github/workflows/release.yml`). Version releases and Vercel deployments have
separate cadences; this does not batch application deployments:

1. Write commits using [Conventional
   Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`,
   `chore:`, …). The prefix determines the semver bump.
2. As those commits land on `main`, release-please maintains a standing **release
   PR** that bumps `version` in `package.json` + `.release-please-manifest.json`
   and updates `CHANGELOG.md`.
3. GitHub suppresses normal `pull_request` events for PRs created with
   `GITHUB_TOKEN`, so the release workflow explicitly dispatches the existing
   CI workflow at Release Please's supported PR-branch output. The release and
   CI workflows independently verify that the ref belongs to the open,
   same-repository, `github-actions[bot]` PR targeting `main`; arbitrary manual
   dispatch refs fail closed.
4. The verified release PR therefore runs the **same CI gate** as application
   PRs before it can land. Merging it tags `vX.Y.Z` and cuts a GitHub Release.

Release Please uses its Conventional Commits-compatible
`chore(main): release ...` title. This automation-generated PR is the sole
exception to the local policy requiring human PR titles and closing references
to include an issue number; the canonical semantic-title check still applies to
normal PR events.

The deployed version and commit SHA are exposed at **`GET /api/health`**
(`version` + `sha`) for support and debugging.

### Monitoring & uptime

Heirloom exposes a lightweight, unauthenticated health probe at **`GET
/api/health`** so an outage is caught by tooling, not by family members. It
returns JSON and an HTTP status:

- **200**: `{"status":"ok","version":…,"sha":…,"db":"ok"|"not_configured", …}`.
  `db: "not_configured"` is still healthy (zero-config mode: the app is up, it
  just has no database).
- **503**: a database _is_ configured but unreachable (`db: "degraded"`), so a
  monitor can alert.

The probe runs a cheap `SELECT 1` with a short timeout, is never cached
(`no-store` + dynamic), and leaks nothing sensitive (the DB result is a coarse
`ok`/`degraded`/`not_configured` enum, never a driver error or connection
string).

The quota-friendly policy deliberately has **no scheduled health monitor**.
Use the central release check, with a manual check only for an authorized
diagnostic. This trades background outage detection and warm compute for lower
idle traffic. Adding an external monitor requires human review of its request
and database-compute budget; do not silently replace the removed schedules
with another service.

---

## Ongoing: how deploys work

- **Merge to `main` → Vercel deploys automatically.** The `vercel-build` script
  applies any new migrations first, then builds.
- **CI** (`.github/workflows/ci.yml`) pins canonical security, lint, web-build,
  artifact, and performance workflows to a reviewed immutable backbone commit.
  Recipes keeps copy/i18n, migration drift/idempotence, Playwright **e2e**,
  route bundle budgets, generated Next/Serwist asset verification, and seeded
  Lighthouse coverage local. E2E and Lighthouse reuse the same canonical build
  archive, and Lighthouse reports stay in private GitHub artifacts. Release
  Please dispatches this gate for its verified release PR because GitHub
  suppresses the usual token-created PR event. No application secrets are
  needed; database jobs use ephemeral Postgres and app builds use
  `SKIP_ENV_VALIDATION` + dev-bypass auth.
- **Dependabot** (`.github/dependabot.yml`) opens weekly dependency + Actions
  update PRs, each gated by CI.
- **Schema changes:** edit the Drizzle schema in `src/server/db/schema/`, run
  `pnpm db:generate` locally to create a migration, and commit it. It applies on
  the next deploy. For breaking changes, follow the **expand/contract**
  convention and the **rollback/repair runbook** in
  [`docs/migrations.md`](docs/migrations.md).

> **`main` is gated on green CI.** The active `Protect main` repository ruleset
> requires every change to arrive through a pull request with the **Quality
> gate** check passing against the latest `main`. It requires zero approving
> reviews, does not require extra approval for unattributed commits, and grants
> no bypass actors. Release Please bot PRs therefore rely on their verified,
> dispatched exact-head CI rather than an approval that automation cannot
> obtain. The ruleset also blocks branch deletion and non-fast-forward updates.
> Vercel therefore deploys only commits that passed the complete CI gate.

## Troubleshooting

- **Build fails in migrations**: double-check `DATABASE_URL` is the Neon
  **pooled** string and includes `?sslmode=require`.
- **Auth errors**: confirm both Clerk keys are set and that your domain is
  allowed in the Clerk dashboard.
- **Uploads fail**: confirm all three Cloudinary vars
  (`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`) are set for the environment you're testing.
- **Wrong share URLs / PWA name**: set `NEXT_PUBLIC_APP_URL` to your real domain
  and redeploy.
