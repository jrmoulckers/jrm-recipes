<div align="center">

# 🍲 Heirloom

**Family recipes, kept alive.**

Create, cook, and pass down the recipes your family loves — beautifully, together.
A production-ready, PWA-first recipe platform built for a family of a few and
ready to scale to millions.

</div>

---

## What is Heirloom?

Heirloom is a warm, dead-simple, and infinitely-scalable place for a family to
write down the dishes everyone asks for — and actually cook from them. It ships
today with the full **core loop**, and is architected in phases toward history,
collaboration, import, and social.

### Shipping now (Phase 1)

- **Ridiculously easy recipes** — a structured editor for ingredients, steps,
  photos, timers, tags, sources, and visibility. Create, edit, delete, share.
- **Cook mode** — hands-free, step-by-step, with built-in timers, serving
  **scaling**, and **unit conversion**. Works **offline** in the kitchen.
- **Print & share** — export a recipe card, full page, or compact format;
  shareable links.
- **Family groups** — recipes can belong to a family/group (foundation in place).
- **Five UI modes × light/dark** — Kitchen, Whimsy, Professional, Kids, and
  Simple, each a full design-token personality. Switch instantly.
- **Accessibility for everyone** — a dedicated preferences panel: larger text,
  high contrast, reduced motion, and easy-reading (dyslexia-friendly) text, plus
  a one-tap **Kids mode**. All settings persist with no flash of the wrong UI.
- **Installable PWA** — add to home screen, with a friendly offline fallback.

### On the roadmap

- **Phase 2 — History & collaboration:** recipe **timelines**, **adaptations/
  forks**, group collaboration, ratings, suggestions, reviews.
- **Phase 3 — Import & AI:** import from URLs/social, AI content generation,
  a technique tutor, and smart substitutions/conversions.
- **Phase 4 — Social & video:** reels/TikTok export and posting to social.

---

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | **Next.js 15** (App Router) + **React 19** + **TypeScript** (strict) |
| Styling | **Tailwind CSS** + CSS-variable design tokens |
| UI | **Radix UI** primitives + a custom component library |
| Database | **Postgres** (Neon in prod / Docker locally) + **Drizzle ORM** |
| Auth | **Clerk**, wrapped in our own module with a guarded **dev-bypass** |
| File storage | **UploadThing** (recipe + step images/video) |
| PWA / offline | **Serwist** service worker |
| Validation | **Zod** |
| Testing | **Vitest** (unit) + **Playwright** (e2e) |
| CI/CD | **GitHub Actions** + **Vercel** (auto-deploy on merge to `main`) |

**Design principle:** the app **boots, builds, and is fully clickable with zero
configuration.** Every external service (DB, auth, uploads) degrades gracefully
to a local dev-bypass when its env vars are absent — so you can run it in one
command, and wire in real services when you're ready.

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

Skip step 3 entirely and the app still runs — you'll get the landing page, all
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
**semantic tokens only** (`bg-primary`, `text-muted-foreground`, …) — never
hard-coded colors:

1. **UI mode** (`data-theme`) — Kitchen · Whimsy · Professional · Kids · Simple.
2. **Color scheme** (`.dark`) — light · dark · system.
3. **Accessibility** (`data-text` / `data-contrast` / `data-motion` /
   `data-reading`) — text size, high contrast, reduced motion, easy-reading type.

Adding a new UI mode is one token block in `src/styles/themes.css` plus one entry
in `src/config/themes.ts`. Nothing else in the app changes. All three axes are
persisted in cookies and applied server-side, so there is **no flash** of the
wrong theme on load.

---

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm preview` | Build **and** start — the way to test PWA/offline |
| `pnpm start` | Start a production server (after `build`) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript checks |
| `pnpm test` / `pnpm test:e2e` | Vitest unit tests / Playwright e2e |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed sample data |
| `pnpm db:studio` | Open Drizzle Studio |

---

## Deployment

Heirloom is built to deploy **one-click from GitHub to Vercel**, then auto-deploy
on every merge to `main`. Migrations run automatically during the Vercel build
(via the `vercel-build` script), so once your environment variables are set you
never have to touch the database by hand.

👉 **Follow the step-by-step checklist in [`DEPLOY.md`](./DEPLOY.md).**

At a glance, you'll provision three free-tier services — **Neon** (Postgres),
**Clerk** (auth), **UploadThing** (file storage) — paste their keys into Vercel,
connect the repo, and deploy.

---

## Contributing

Before pushing, the same gate CI runs is:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

CI (`.github/workflows/ci.yml`) runs this on every PR and push to `main`.

---

<div align="center">
Made with care for the people whose recipes deserve to outlive the index card.
</div>
