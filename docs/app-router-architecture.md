# App Router architecture

This document describes Heirloom's Next.js App Router layout, Server/Client Component boundaries, server-action pipeline, caching conventions, and auth boundary.

## Route tree overview

Routes live under [`src/app`](../src/app):

- [`src/app/layout.tsx`](../src/app/layout.tsx) is the root Server Component layout. It imports global CSS, loads fonts, reads cookies and the CSP nonce header, resolves locale/messages, calls `getCurrentUser()`, evaluates feature flags, wraps the tree in `NextIntlClientProvider`, and conditionally wraps with `ClerkProvider` when Clerk is configured.
- [`src/app/providers.tsx`](../src/app/providers.tsx) is the root client boundary for app-wide providers: theme, accessibility, household size, consent, analytics, flags, tooltips, pageview tracking, connectivity status, and toast UI.
- [`src/app/(main)`](<../src/app/(main)>) is the normal app shell. Its layout adds skip link, header, footer, bottom nav, install prompt, and update prompt.
- [`src/app/(immersive)`](<../src/app/(immersive)>) is the full-bleed shell for focused routes such as Cook Mode and print/keepsake views. Its layout intentionally drops header/footer/nav while inheriting root providers and theming.
- [`src/app/api`](../src/app/api) contains route handlers for operational endpoints and webhooks, including health, Cloudinary signing, digest, Stripe webhook, Clerk webhook, backup, and oEmbed.
- [`src/app/embed`](../src/app/embed) contains embeddable recipe routes.
- [`src/app/import/route.ts`](../src/app/import/route.ts) is the PWA share-target handler.
- [`src/app/~offline/page.tsx`](../src/app/~offline/page.tsx) is the service-worker offline fallback page.
- [`src/app/manifest.ts`](../src/app/manifest.ts), [`src/app/robots.ts`](../src/app/robots.ts), and [`src/app/sitemap.ts`](../src/app/sitemap.ts) provide the PWA manifest, robots policy, and dynamic sitemap.
- [`src/app/error.tsx`](../src/app/error.tsx), [`src/app/global-error.tsx`](../src/app/global-error.tsx), [`src/app/(main)/error.tsx`](<../src/app/(main)/error.tsx>), and [`src/app/not-found.tsx`](../src/app/not-found.tsx) provide route/global error and 404 surfaces.

## Server and client boundaries

The default is Server Components. Page and layout files that do not start with `"use client"` fetch data and render on the server, including root layout, main layout, immersive layout, sitemap, robots, manifest, offline page, and most route pages.

Client boundaries are explicit and localized:

- [`src/app/providers.tsx`](../src/app/providers.tsx) is the app-wide provider boundary.
- Error boundaries such as [`src/app/error.tsx`](../src/app/error.tsx) and [`src/app/global-error.tsx`](../src/app/global-error.tsx) are client components because they receive `reset` and use effects.
- Interactive UI under [`src/components`](../src/components) declares `"use client"` where needed: forms, dialogs, navigation controls, Cook Mode, PWA prompts, notifications, shopping-list interactions, recipe editor, rating/review/comment controls, and similar browser-driven surfaces.
- Server-only data, auth, and mutation modules declare `import "server-only"` where appropriate, for example [`src/server/auth/index.ts`](../src/server/auth/index.ts), [`src/server/action.ts`](../src/server/action.ts), [`src/server/errors.ts`](../src/server/errors.ts), and feature query/mutation modules.

This keeps database access and secrets in server modules while letting client components call typed server actions or receive server-rendered props.

## Server-action pipeline

Feature actions live in `src/server/<feature>/actions.ts` and usually call into `queries.ts` and `mutations.ts` siblings. The shared primitives are:

- [`src/server/action-result.ts`](../src/server/action-result.ts), which defines `ActionResult<T>`, `ok()`, `fail()`, and `fromZodError()`.
- [`src/server/action.ts`](../src/server/action.ts), which defines `authedAction()` for the common guard sequence.
- [`src/server/errors.ts`](../src/server/errors.ts), which defines typed `DomainError` codes and `messageForError()`.

The common lifecycle is:

```mermaid
flowchart TD
  A[Client form or event calls server action] --> B[DB configured guard]
  B --> C[Zod safeParse]
  C -->|invalid| D[fromZodError -> ActionResult failure]
  C -->|valid| E[requireUser / getCurrentUser via Clerk auth module]
  E --> F[Feature mutation in src/server/<feature>/mutations.ts]
  F --> G[Drizzle transaction and authorization/domain checks]
  G -->|DomainError| H[messageForError -> fail()]
  G -->|success| I[ok typed ActionResult]
  I --> J[revalidatePath / revalidateTag / redirect as needed]
  H --> K[Client renders field/global errors]
  J --> L[Client updates UI or navigates]
```

[`src/server/recipes/actions.ts`](../src/server/recipes/actions.ts) shows the newer `authedAction()` style for create/update: database guard, Zod `recipeInput`, `requireUser()`, mutation, analytics, path/tag revalidation, and a typed `{ id, slug }` result. [`src/server/groups/actions.ts`](../src/server/groups/actions.ts) performs the same stages manually for group actions, using Zod inputs, `requireUser()`, `ActionResult`, and group-specific domain-error copy.

Mutations are deliberately separate from actions. For example, [`src/server/recipes/mutations.ts`](../src/server/recipes/mutations.ts) and [`src/server/groups/mutations.ts`](../src/server/groups/mutations.ts) run Drizzle transactions, enforce authorization, throw `DomainError` codes, and perform multi-table writes. Query modules such as [`src/server/recipes/queries.ts`](../src/server/recipes/queries.ts) and [`src/server/groups/queries.ts`](../src/server/groups/queries.ts) are read-focused and `server-only`.

## Caching and revalidation

The code distinguishes public cacheable reads from personalized reads:

- [`src/server/recipes/queries.ts`](../src/server/recipes/queries.ts) wraps the public recipe feed in `unstable_cache`, using `PUBLIC_RECIPES_REVALIDATE_SECONDS` and `PUBLIC_RECIPES_TAG` from [`src/server/recipes/cache.ts`](../src/server/recipes/cache.ts).
- [`src/server/recipes/cache-tags.ts`](../src/server/recipes/cache-tags.ts) centralizes tag strings with `PUBLIC_RECIPES_TAG`, `recipeTag(id)`, and `recipeMutationTags(id)`.
- Recipe actions call `revalidatePath()` for affected route surfaces and `revalidateTag()` through `recipeMutationTags()` after creates, updates, deletes, restores, forks, share-link changes, and version reverts.
- Group actions in [`src/server/groups/actions.ts`](../src/server/groups/actions.ts) use `revalidatePath("/groups")` plus the affected `/groups/[slug]` and settings paths.
- Personalized or access-controlled recipe reads stay dynamic; [`src/server/recipes/queries.ts`](../src/server/recipes/queries.ts) documents that the recipe detail query is intentionally not wrapped in `unstable_cache`.
- Auth resolution is request-memoized with React `cache()` in [`src/server/auth/index.ts`](../src/server/auth/index.ts), so multiple server reads in one render share one `auth()`/user lookup without leaking across requests.

Soft-delete filtering is also part of the read convention: [`src/server/recipes/queries.ts`](../src/server/recipes/queries.ts) defines `notDeleted = isNull(recipes.deletedAt)` and applies it to recipe list, detail, search, lineage, timeline, and facet reads.

## Auth boundary

[`src/middleware.ts`](../src/middleware.ts) is the request boundary. It wraps requests in Clerk middleware when Clerk keys are configured, or a dev-bypass path for local/test runs when allowed. The same middleware also:

- mints a per-request CSP nonce and forwards it on `x-nonce`;
- applies security headers;
- negotiates and persists the locale cookie;
- skips static assets and Next internals via the matcher.

App code does not generally import Clerk directly. [`src/server/auth/index.ts`](../src/server/auth/index.ts) centralizes auth:

- `isAuthConfigured()` decides whether real Clerk auth is active.
- `getCurrentUser()` returns the current app user or the allowed dev user and is request-memoized.
- `requireUser()` throws when an action or protected read needs a signed-in user.
- Clerk profile update/delete webhooks keep the local `users` row in sync and soft-delete/anonymize on deletion.

Because middleware does not call `.protect()` for every route, authorization is enforced at the data/action layer with `getCurrentUser()`, `requireUser()`, membership checks, and feature-specific guards.

## Route handlers and runtime notes

Route handlers opt into runtime behavior where needed. For example:

- [`src/app/api/health/route.ts`](../src/app/api/health/route.ts) uses `runtime = "nodejs"`, `dynamic = "force-dynamic"`, and `revalidate = 0` so health checks are live and can probe the database.
- [`src/app/import/route.ts`](../src/app/import/route.ts) uses `runtime = "nodejs"` because Cloudinary uploads need Node crypto and server-side secrets.
- [`src/app/sitemap.ts`](../src/app/sitemap.ts) uses `dynamic = "force-dynamic"` so newly published public recipes and cook profiles can appear without a rebuild.

_Related issue: #213._
