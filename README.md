<div align="center">

# 🍲 Heirloom

**Family recipes, kept alive.**

Create, cook, and pass down the recipes your family loves, beautifully and together.
A production-ready, PWA-first recipe platform built for a family of a few and
ready to scale to millions.

</div>

---

## What is Heirloom?

Heirloom is a warm, dead-simple, and infinitely-scalable place for a family to
write down the dishes everyone asks for and actually cook from them. It ships
today with the full **core loop**, and is architected in phases toward history,
collaboration, import, and social.

### Shipping now (Phase 1)

- **Ridiculously easy recipes**: a structured editor for ingredients, steps,
  photos, timers, tags, sources, and visibility. Create, edit, delete, share.
- **Cook mode**: hands-free, step-by-step, with built-in timers, serving
  **scaling**, and **unit conversion**. Works **offline** in the kitchen.
- **Print & share**: export a recipe card, full page, or compact format.
  Shareable links.
- **Family groups**: recipes can belong to a family/group (foundation in place).
- **Five UI modes × light/dark**: Kitchen, Whimsy, Professional, Kids, and
  Simple, each a full design-token personality. Switch instantly.
- **Accessibility for everyone**: a dedicated preferences panel: larger text,
  high contrast, reduced motion, and easy-reading (dyslexia-friendly) text, plus
  a one-tap **Kids mode**. All settings persist with no flash of the wrong UI.
- **Installable PWA**: add to home screen, with a friendly offline fallback.

### On the roadmap

- **Phase 2. History & collaboration:** recipe **timelines**, **adaptations/
  forks**, group collaboration, ratings, suggestions, reviews.
- **Phase 3. Import & AI:** import from URLs/social, AI content generation,
  a technique tutor, and smart substitutions/conversions.
- **Phase 4. Social & video:** reels/TikTok export and posting to social.

---

## Tech stack

| Area          | Choice                                                               |
| ------------- | -------------------------------------------------------------------- |
| Framework     | **Next.js 15** (App Router) + **React 19** + **TypeScript** (strict) |
| Styling       | **Tailwind CSS** + CSS-variable design tokens                        |
| UI            | **Radix UI** primitives + a custom component library                 |
| Database      | **Postgres** (Neon in prod / Docker locally) + **Drizzle ORM**       |
| Auth          | **Clerk**, wrapped in our own module with a guarded **dev-bypass**   |
| File storage  | **Cloudinary** (recipe + step images/video)                          |
| PWA / offline | **Serwist** service worker                                           |
| Validation    | **Zod**                                                              |
| Testing       | **Vitest** (unit) + **Playwright** (e2e)                             |
| CI/CD         | **GitHub Actions** + **Vercel** (auto-deploy on merge to `main`)     |

**Design principle:** the app **boots, builds, and is fully clickable with zero
configuration.** Every external service (DB, auth, uploads) degrades gracefully
to a local dev-bypass when its env vars are absent, so you can run it in one
command, and wire in real services when you're ready.

> **Security note:** the auth **dev-bypass** (a single shared local user) is
> strictly a **local/test** affordance. Any **deployed** environment, preview or
> production, requires real Clerk keys: with `NEXT_PUBLIC_DEV_AUTH_BYPASS=1` or
> missing Clerk keys it fails closed (throws) instead of silently serving everyone
> as one shared account. Production is caught at build/boot (Vercel
> `VERCEL_ENV=production`) and every deploy is caught per request
> (`NODE_ENV=production`). `SKIP_ENV_VALIDATION` (used only by the CI build + e2e,
> which serve no real users) is the sole escape hatch.

---

## Quick start (local development)

**Prerequisites:** [Node 20+](https://nodejs.org),
[pnpm 10+](https://pnpm.io/installation), and (optional, for a real database)
[Docker](https://docs.docker.com/get-docker/).

```bash
# 1. Install dependencies
pnpm install

# 2. Create your env file (all values are optional for local dev)
cp .env.example .env

# 3. (Optional) start a local Postgres and load the schema + sample recipes
docker compose up -d      # Postgres on :5432, matches the default DATABASE_URL
pnpm db:migrate           # apply the schema
pnpm db:seed              # add a few sample recipes

# 4. Run it
pnpm dev                  # http://localhost:3000
```

Skip step 3 entirely and the app still runs. You'll get the landing page, all
five themes, cook-mode UI, and the accessibility panel without any database or
accounts. Pages that need data will tell you clearly when `DATABASE_URL` is unset.

> **Note:** the service worker (offline/PWA) is **disabled in `next dev`** on
> purpose. To try offline mode, run a production build: `pnpm preview`.

---

## Project structure

```
src/
├─ app/                      # Next.js App Router
│  ├─ (main)/                # site chrome: home, recipes, groups, editor
│  ├─ (immersive)/           # full-screen, no-chrome: cook mode, print
│  ├─ ~offline/              # PWA offline fallback page
│  ├─ api/                   # route handlers (uploads, etc.)
│  ├─ layout.tsx             # root layout, theming + a11y SSR (no-flash)
│  ├─ providers.tsx          # client providers (theme, a11y, tooltips, toasts)
│  ├─ manifest.ts            # PWA web manifest
│  └─ sw.ts                  # Serwist service worker
├─ components/
│  ├─ ui/                    # design-system primitives (button, dialog, …)
│  ├─ theme/                 # 5-mode theming (provider, switcher, no-flash script)
│  ├─ a11y/                  # accessibility preferences (provider, menu, script)
│  ├─ recipe/ · cook/ · print/ · pwa/ · layout/ · auth/
├─ config/                   # brand, themes, a11y, nav (single sources of truth)
├─ server/
│  ├─ db/                    # Drizzle client + schema + seed
│  ├─ auth/                  # Clerk wrapper + dev-bypass
│  └─ recipes/              # queries, mutations, server actions, validation
├─ lib/                      # pure helpers (units, utils)
└─ styles/                   # globals.css, themes.css (tokens), a11y.css
```

---

## Design system: theming & accessibility

Theming has **three orthogonal axes**, and every component styles itself using
**semantic tokens only** (`bg-primary`, `text-muted-foreground`, …), never
hard-coded colors:

1. **UI mode** (`data-theme`): Kitchen · Whimsy · Professional · Kids · Simple.
2. **Color scheme** (`.dark`): light · dark · system.
3. **Accessibility** (`data-text` / `data-contrast` / `data-motion` /
   `data-reading`): text size, high contrast, reduced motion, easy-reading type.

Adding a new UI mode is one token block in `src/styles/themes.css` plus one entry
in `src/config/themes.ts`. Nothing else in the app changes. All three axes are
persisted in cookies and applied server-side, so there is **no flash** of the
wrong theme on load.

---

## Internationalization (i18n)

Heirloom ships message catalogs for **English (default), Spanish, German, and
Arabic**. The active locale is resolved from the `NEXT_LOCALE` cookie (no URL
prefix) and applied server-side, so the right language and writing direction
render on first paint. Switch languages from the header's language menu.

**Convention: all user-facing copy comes from the message catalogs. Never
hardcode it in JSX.**

- **Catalogs** live in `src/messages/<locale>.json` (`en`, `es`, `de`, `ar`) and
  are read through [next-intl](https://next-intl.dev): `useTranslations()` in
  client components, `getTranslations()` on the server. Add every new string to
  **all** catalogs, keyed under a namespace.
- **Formatting** is locale-aware via helpers. `~/lib/i18n-format` (numbers,
  quantities, lists), `~/lib/dates` (dates, weekdays, relative time), and the
  measurement/temperature utilities rather than hand-built English strings.
- **RTL:** components use Tailwind **logical** utilities (`ps-`/`pe-`,
  `ms-`/`me-`, `text-start`/`text-end`, `start-`/`end-`) so layouts mirror
  automatically under `dir="rtl"`.
- **Guardrail:** ESLint's `i18next/no-literal-string` (warning) flags hardcoded
  JSX text and the user-facing `alt` / `aria-label` / `placeholder` / `title`
  attributes so new copy can't silently skip translation. It's scoped to UI
  code. Non-UI strings (`className`, `data-*`, routes, config) and tests/seed
  are ignored. Existing English strings are being migrated surface-by-surface,
  so the rule stays at **warn** (it doesn't fail `pnpm lint`) until extraction
  completes. Treat new warnings in your diff as a prompt to use a catalog.

---

## Scripts

| Command                        | What it does                                     |
| ------------------------------ | ------------------------------------------------ |
| `pnpm dev`                     | Start the dev server                             |
| `pnpm build`                   | Production build                                 |
| `pnpm preview`                 | Build **and** start, the way to test PWA/offline |
| `pnpm start`                   | Start a production server (after `build`)        |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript checks                       |
| `pnpm test` / `pnpm test:e2e`  | Vitest unit tests / Playwright e2e               |
| `pnpm db:generate`             | Generate a migration from schema changes         |
| `pnpm db:migrate`              | Apply migrations                                 |
| `pnpm db:seed`                 | Seed sample data                                 |
| `pnpm db:studio`               | Open Drizzle Studio                              |

---

## Deployment

Heirloom is built to deploy **one-click from GitHub to Vercel**, then auto-deploy
on every merge to `main`. Migrations run automatically during the Vercel build
(via the `vercel-build` script), so once your environment variables are set you
never have to touch the database by hand.

👉 **Follow the step-by-step checklist in [`DEPLOY.md`](./DEPLOY.md).**

At a glance, you'll provision three free-tier services. **Neon** (Postgres),
**Clerk** (auth), **Cloudinary** (file storage), paste their keys into Vercel,
connect the repo, and deploy.

---

## Contributing

Before pushing, run the same gate CI runs:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm copy:check
pnpm audit:ci
pnpm test
pnpm db:generate
git diff --exit-code -- drizzle
pnpm check:bundle
```

### If `pnpm format:check` reports hundreds of unformatted files

Your working tree predates [`.gitattributes`](.gitattributes) and still has CRLF
line endings. Prettier expects LF, so it flags nearly every tracked file at once —
none of which actually have a formatting problem.

Git will not tell you: it converts line endings on read, so `git status` and
`git diff` stay clean whether your tree is LF or CRLF. Adding `.gitattributes`
does not rewrite files already on disk, and neither `git add --renormalize .` nor
`git checkout-index -f -a` repairs it — the first only updates the index (already
LF), and the second is skipped by git's stat cache.

With a **clean** tree, force a real re-checkout:

```bash
git status --porcelain   # must print nothing — the next command discards changes
git rm -r --cached . -q
git reset --hard
```

`pnpm format:check` should then pass. Clones created after `.gitattributes` landed
are unaffected.

On **every** pull request — whatever branch it is based on — and on pushes to
`main`, GitHub Actions runs:

- **Canonical CI callers** (`.github/workflows/ci.yml`): reviewed shared
  workflows provide security, semantic PR-title, format, lint, typecheck, unit,
  production build, artifact, and aggregate performance gates at an immutable
  backbone commit.
- **Recipes gates**: local jobs preserve copy/i18n, migration
  drift/idempotence, Playwright **e2e**, route bundle budgets, generated
  Next/Serwist asset checks, and seeded Lighthouse coverage. E2E and Lighthouse
  reuse the canonical build archive; database jobs use ephemeral Postgres and
  Lighthouse reports remain private. No application secrets are required.
- **Signal integrity**: a `Base freshness` job reports when the merge ref being
  tested is older than the base branch, and a single `Quality gate` job fails
  unless every other job succeeded.
- **Release PR CI**: Release Please PRs created with `GITHUB_TOKEN` do not emit
  the usual PR event. The release workflow explicitly dispatches the same CI at
  its verified in-repository bot branch; arbitrary manual refs fail closed.

Stacking a PR on another branch no longer skips the gate. See
[docs/ci.md](docs/ci.md) for what runs, and for the three cases where a green
check list still is not a passing gate.

**Dependabot** (`.github/dependabot.yml`) opens weekly PRs to keep npm packages
and GitHub Actions current, each one gated by CI.

---

<div align="center">
Made with care for the people whose recipes deserve to outlive the index card.
</div>
