# Deploying Heirloom

This is the **one-time setup** to take Heirloom live. After this, every merge to
`main` auto-deploys and runs database migrations for you.

You'll provision three services (all have generous free tiers), paste their keys
into Vercel, and connect the repo. Budget ~20 minutes.

- [Neon](https://neon.tech) — serverless Postgres database
- [Clerk](https://clerk.com) — authentication
- [Cloudinary](https://cloudinary.com) — image/video storage & delivery
- [Vercel](https://vercel.com) — hosting + CI/CD

> **Clerk is required for any deployed environment (preview or production).** The
> app fails closed: a deploy that would fall back to dev-bypass auth — no Clerk
> keys, or `NEXT_PUBLIC_DEV_AUTH_BYPASS=1` — refuses to build/boot (production) or
> to serve requests (preview), so set the Clerk keys before you deploy. Dev-bypass
> (a single shared local user) is strictly a **local/test** affordance. Neon
> (Postgres) backs your real data. Cloudinary stays optional — without it, photo
> fields fall back to pasting an image URL, so add it whenever you want native
> drag-and-drop / camera uploads, with no code changes.

---

## 1. Database — Neon

1. Create a Neon account and a new **Project** (pick a region near your users).
2. In the project dashboard, open **Connection Details**.
3. Copy the **pooled** connection string (it contains `-pooler` in the host).
   It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/DB?sslmode=require
   ```
4. Save it — this is your **`DATABASE_URL`**.

> Heirloom's Postgres client uses `prepare: false` and a small pool, which is
> exactly what Neon's pooled endpoint wants. Migrations run automatically on
> deploy, so you don't need to run anything by hand.

---

## 2. Authentication — Clerk

1. Create a Clerk account and a new **Application**. Enable whichever sign-in
   methods you want (email, Google, etc.).
2. From **API Keys**, copy:
   - **Publishable key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret key** → `CLERK_SECRET_KEY`
3. (Optional) If you host at a custom domain, add it to Clerk's allowed origins.

Heirloom uses Clerk's **modal** sign-in and sign-up (a popup — there is no
dedicated `/sign-in` page), so you can leave `NEXT_PUBLIC_CLERK_SIGN_IN_URL` /
`..._SIGN_UP_URL` unset. The two keys above are all you need.

---

## 3. File storage — Cloudinary

1. Create a [Cloudinary](https://cloudinary.com) account. Your **Cloud name** is
   shown on the dashboard.
2. Open **Settings → API Keys** and copy the **API Key** and **API Secret**.
3. You'll set three env vars in step 4:
   - **`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`** — your cloud name
   - **`NEXT_PUBLIC_CLOUDINARY_API_KEY`** — the API key (public, client-safe)
   - **`CLOUDINARY_API_SECRET`** — the API secret (server-only; used to sign
     uploads so the browser never sees it)

> Optional for launch. When these are unset, every photo field (recipe cover +
> each step) shows a plain "paste an image URL" input. Set all three and the same
> fields upgrade to drag-and-drop, camera, and direct-URL uploads — no code
> changes, no redeploy of the app needed beyond adding the vars.

---

## 3b. Billing — Stripe (optional)

Heirloom is fully usable on the **Free** tier with no billing configured — the
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
   - **`STRIPE_SECRET_KEY`** — server-only secret key
   - **`STRIPE_WEBHOOK_SECRET`** — the webhook signing secret
   - **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** — the publishable key (client-safe)

> Optional. When unset, the whole billing layer degrades to a no-op: nobody can
> be charged, and every feature that isn't limit-gated stays available.

---

## 4. Deploy — Vercel

1. Push this repo to GitHub (if it isn't already).
2. In Vercel, **Add New… → Project** and **import** the repo. Vercel auto-detects
   Next.js; leave the framework preset as **Next.js**.
   - Do **not** override the Build Command. The repo ships a `vercel-build`
     script that runs database migrations and then `next build` — Vercel uses it
     automatically.
3. Under **Environment Variables**, add the values you collected (see the table
   below). Add them to **Production**. For **Preview**, do **not** reuse the
   production `DATABASE_URL` — see [Isolating preview
   databases](#isolating-preview-databases) below.
4. Click **Deploy**.

That's it. On this and every future deploy, Vercel will run the migrations
against Neon and build the app.

### Environment variables

| Variable                            | Required?   | Value                                                                                        |
| ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                      | **Yes**     | Neon **pooled** connection string (step 1)                                                   |
| `NEXT_PUBLIC_APP_URL`               | **Yes**     | Your public site URL, e.g. `https://heirloom.yourdomain.com`                                 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | For auth    | Clerk publishable key                                                                        |
| `CLERK_SECRET_KEY`                  | For auth    | Clerk secret key                                                                             |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | For uploads | Cloudinary cloud name                                                                        |
| `NEXT_PUBLIC_CLOUDINARY_API_KEY`    | For uploads | Cloudinary API key (public)                                                                  |
| `CLOUDINARY_API_SECRET`             | For uploads | Cloudinary API secret (server-only)                                                          |
| `STRIPE_SECRET_KEY`                 | For billing | Stripe secret key (server-only)                                                              |
| `STRIPE_WEBHOOK_SECRET`             | For billing | Stripe webhook signing secret for `/api/stripe/webhook`                                       |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`| For billing | Stripe publishable key (public, client-safe)                                                 |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`     | Optional    | Defaults to `/sign-in`                                                                       |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`     | Optional    | Defaults to `/sign-up`                                                                       |
| `NEXT_PUBLIC_DEV_AUTH_BYPASS`       | Never (deploys) | Local/test-only. Forces dev-bypass auth. **Any deploy — preview or production — with this set to `1` (or with Clerk keys missing) fails closed** (production at build/boot, preview per request) — leave it unset. |

> Set `NEXT_PUBLIC_APP_URL` to your real domain so share links and PWA metadata
> are correct.

> **Production deploy preflight (`scripts/preflight-env.mjs`).** Because every
> variable above is technically optional (so local/CI/preview can boot with zero
> config), production deploys run a preflight check _before_ migrations and the
> build. When `VERCEL_ENV=production`, it fails the deploy fast with an
> actionable message unless all of these are present and well-formed:
>
> - `DATABASE_URL` — a `postgres://` / `postgresql://` URL
> - `NEXT_PUBLIC_APP_URL` — an absolute `http(s)` URL
> - `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
> - `NEXT_PUBLIC_DEV_AUTH_BYPASS` **must not** be `1`
>
> Local, CI, and preview builds skip the check entirely, so zero-config runs are
> unaffected.

### Isolating preview databases

Vercel runs `vercel-build` for **preview** deployments too, and a preview shares
the project's environment variables. If you add the production `DATABASE_URL` to
the Preview environment, a PR's build would run schema **migrations against the
production database** — at best noisy, at worst destructive. Never do this.

Instead, give previews their own throwaway database:

- **Recommended — Neon branching.** Install the [Neon–Vercel
  integration](https://neon.tech/docs/guides/vercel) and enable "Create a
  database branch for each preview". Neon injects a per-PR branch `DATABASE_URL`
  into the Preview environment automatically and deletes the branch when the PR
  closes, so previews get an isolated copy of the schema/data.
- **Or leave Preview with no `DATABASE_URL`.** The app boots read-degraded and
  `scripts/migrate.mjs` skips (it exits 0 when no URL is set), which is safe if
  you don't need a working database in previews.

As a defense-in-depth guardrail, `scripts/migrate.mjs` **refuses to migrate from
a preview deploy** (`VERCEL_ENV=preview`) unless you explicitly opt in with
`ALLOW_PREVIEW_MIGRATIONS=1` — so even a misconfigured Preview `DATABASE_URL`
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
   (a subdomain like `heirloom.yourdomain.com` is simplest; the apex
   `yourdomain.com` also works).
2. Vercel shows the **exact** DNS records to create. Because this domain's DNS is
   at your registrar (not Vercel), add them there — always use the values Vercel
   displays, but they're typically:
   - **Subdomain** → a **CNAME** to `cname.vercel-dns.com`.
   - **Apex/root** → an **A** record to the IP Vercel lists (e.g. `76.76.21.21`).
3. Wait for Vercel to verify (minutes; DNS propagation can take longer).
4. Update **`NEXT_PUBLIC_APP_URL`** to the new URL and redeploy so share links,
   Open Graph tags, and PWA metadata are correct.
5. If Clerk is enabled, also add the domain under Clerk → **Domains**.

### Promote Clerk from development to production

Clerk's `pk_test_…` / `sk_test_…` keys are a **development** instance — fine for
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
idempotent — safe to run twice; delete them from the UI any time).

### Run a staging environment (optional)

Want a stable, always-on pre-production URL (separate from per-PR previews) to
smoke-test before promoting to production? Heirloom supports a **staging**
environment:

1. In Vercel → **Settings → Git**, keep Production tracking `main` and add a
   long-lived **`staging`** branch as a deployment branch (or use a dedicated
   Vercel "Preview" branch). Pushes to `staging` build a stable staging URL.
2. Give staging its **own** `DATABASE_URL` — a Neon branch of production is
   ideal — and its own Clerk keys, exactly like production (never point staging
   at the production database).
3. `staging` runs the **same CI gate** as `main` (the CI workflow triggers on
   pushes to both), so nothing lands on staging without passing lint, tests, and
   the build.
4. Promote by fast-forwarding `main` to the reviewed `staging` commit (or open a
   `staging → main` PR). Vercel then deploys production from `main` as usual.

Because migrations only auto-run in production and are skipped on preview
(#258), staging uses its own branch database and the standard `vercel-build`
flow, so a broken migration surfaces on staging before it can reach production.

### Automated releases (versioning & changelog)

Versioning, the changelog, and release tags are automated with
[release-please](https://github.com/googleapis/release-please)
(`.github/workflows/release.yml`), so every production deploy maps to a
human-readable version instead of a raw commit SHA:

1. Write commits using [Conventional
   Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`,
   `chore:`, …). The prefix determines the semver bump.
2. As those commits land on `main`, release-please maintains a standing **release
   PR** that bumps `version` in `package.json` + `.release-please-manifest.json`
   and updates `CHANGELOG.md`.
3. That release PR runs the **same CI gate** as any other PR, so a release can
   only land on green CI. Merging it tags `vX.Y.Z` and cuts a GitHub Release.

The deployed version and commit SHA are exposed at **`GET /api/health`**
(`version` + `sha`) for support and debugging.

### Monitoring & uptime

Heirloom exposes a lightweight, unauthenticated health probe at **`GET
/api/health`** so an outage is caught by tooling, not by family members. It
returns JSON and an HTTP status:

- **200** — `{"status":"ok","version":…,"sha":…,"db":"ok"|"not_configured", …}`.
  `db: "not_configured"` is still healthy (zero-config mode: the app is up, it
  just has no database).
- **503** — a database _is_ configured but unreachable (`db: "degraded"`), so a
  monitor can alert.

The probe runs a cheap `SELECT 1` with a short timeout, is never cached
(`no-store` + dynamic), and leaks nothing sensitive (the DB result is a coarse
`ok`/`degraded`/`not_configured` enum, never a driver error or connection
string).

Wire an external uptime monitor against `https://<your-domain>/api/health`:

1. In [Better Stack](https://betterstack.com/uptime),
   [UptimeRobot](https://uptimerobot.com/), or Vercel's built-in monitoring,
   create an HTTP monitor for that URL on a 1–5 minute interval.
2. Treat any non-200 (including 503) as **down** and add an email/Slack/SMS
   alert contact.
3. Optionally assert the body contains `"status":"ok"` to catch degraded-DB
   states that some monitors would otherwise see as reachable.

---

## Ongoing: how deploys work

- **Merge to `main` → Vercel deploys automatically.** The `vercel-build` script
  applies any new migrations first, then builds.
- **CI** (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, a build,
  and a Playwright **e2e** smoke test on every PR and push to `main` — no secrets
  needed (it builds with `SKIP_ENV_VALIDATION` + dev-bypass auth).
- **Dependabot** (`.github/dependabot.yml`) opens weekly dependency + Actions
  update PRs, each gated by CI.
- **Schema changes:** edit the Drizzle schema in `src/server/db/schema/`, run
  `pnpm db:generate` locally to create a migration, and commit it. It applies on
  the next deploy. For breaking changes, follow the **expand/contract**
  convention and the **rollback/repair runbook** in
  [`docs/migrations.md`](docs/migrations.md).

> **Gate the site on green CI (optional but recommended).** Vercel deploys `main`
> independently of GitHub Actions, so a build that passes Vercel but fails CI can
> still ship. To require checks first, add a branch-protection rule on `main`
> (Settings → Branches) requiring the **CI** status checks — then nothing reaches
> the site until lint, tests, and the build pass.

## Troubleshooting

- **Build fails in migrations** — double-check `DATABASE_URL` is the Neon
  **pooled** string and includes `?sslmode=require`.
- **Auth errors** — confirm both Clerk keys are set and that your domain is
  allowed in the Clerk dashboard.
- **Uploads fail** — confirm all three Cloudinary vars
  (`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`) are set for the environment you're testing.
- **Wrong share URLs / PWA name** — set `NEXT_PUBLIC_APP_URL` to your real domain
  and redeploy.
