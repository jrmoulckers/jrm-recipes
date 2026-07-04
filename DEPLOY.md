# Deploying Heirloom

This is the **one-time setup** to take Heirloom live. After this, every merge to
`main` auto-deploys and runs database migrations for you.

You'll provision three services (all have generous free tiers), paste their keys
into Vercel, and connect the repo. Budget ~20 minutes.

- [Neon](https://neon.tech) — serverless Postgres database
- [Clerk](https://clerk.com) — authentication
- [UploadThing](https://uploadthing.com) — image/video storage
- [Vercel](https://vercel.com) — hosting + CI/CD

> You can go live with **just Neon** if you like. Without Clerk, the app runs in
> its guarded dev-bypass auth mode. Images are added today by pasting an image
> URL, so UploadThing is optional at launch — native in-app photo/video uploads
> are the next media enhancement (the SDK is already installed). Add Clerk and
> UploadThing whenever you're ready — no code changes required to go live.

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

## 3. File storage — UploadThing

1. Create an UploadThing account and a new **App**.
2. From the app's **API Keys**, copy the token → **`UPLOADTHING_TOKEN`**.

> Optional for launch. Recipe and step images are currently added by URL; wiring
> native drag-and-drop uploads (photos/video per step) is the next media pass,
> and the `uploadthing` SDK is already installed for it. Setting the token now
> means zero extra config when that ships.

---

## 4. Deploy — Vercel

1. Push this repo to GitHub (if it isn't already).
2. In Vercel, **Add New… → Project** and **import** the repo. Vercel auto-detects
   Next.js; leave the framework preset as **Next.js**.
   - Do **not** override the Build Command. The repo ships a `vercel-build`
     script that runs database migrations and then `next build` — Vercel uses it
     automatically.
3. Under **Environment Variables**, add the values you collected (see the table
   below). Add them to **Production** (and Preview if you want preview deploys to
   use real services).
4. Click **Deploy**.

That's it. On this and every future deploy, Vercel will run the migrations
against Neon and build the app.

### Environment variables

| Variable | Required? | Value |
| --- | --- | --- |
| `DATABASE_URL` | **Yes** | Neon **pooled** connection string (step 1) |
| `NEXT_PUBLIC_APP_URL` | **Yes** | Your public site URL, e.g. `https://heirloom.yourdomain.com` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | For auth | Clerk publishable key |
| `CLERK_SECRET_KEY` | For auth | Clerk secret key |
| `UPLOADTHING_TOKEN` | For uploads | UploadThing token |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Optional | Defaults to `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Optional | Defaults to `/sign-up` |
| `NEXT_PUBLIC_DEV_AUTH_BYPASS` | Optional | Set to `1` to force dev-bypass auth even if Clerk keys exist. **Leave unset in production.** |

> Set `NEXT_PUBLIC_APP_URL` to your real domain so share links and PWA metadata
> are correct.

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

---

## Ongoing: how deploys work

- **Merge to `main` → Vercel deploys automatically.** The `vercel-build` script
  applies any new migrations first, then builds.
- **CI** (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, and a
  build on every PR — no secrets needed (it builds with `SKIP_ENV_VALIDATION`).
- **Schema changes:** edit the Drizzle schema in `src/server/db/schema/`, run
  `pnpm db:generate` locally to create a migration, and commit it. It applies on
  the next deploy.

## Troubleshooting

- **Build fails in migrations** — double-check `DATABASE_URL` is the Neon
  **pooled** string and includes `?sslmode=require`.
- **Auth errors** — confirm both Clerk keys are set and that your domain is
  allowed in the Clerk dashboard.
- **Uploads fail** — confirm `UPLOADTHING_TOKEN` is set for the environment
  you're testing.
- **Wrong share URLs / PWA name** — set `NEXT_PUBLIC_APP_URL` to your real domain
  and redeploy.
