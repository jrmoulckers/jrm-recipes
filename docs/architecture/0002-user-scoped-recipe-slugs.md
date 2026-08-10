# ADR 0002: User-Scoped Recipe Slugs

- **Status:** Accepted
- **Date:** 2026-08-09
- **Issue:** [#666](https://github.com/jrmoulckers/jrm-recipes/issues/666)

## Context

Recipe URLs were `/recipes/<slug>` with a globally unique slug enforced by `recipes_slug_uq`. Two
problems followed from that single global namespace.

Only one account in the entire product could hold a given slug. The second person to save a recipe
called "Blueberry Muffins" received a perturbed slug such as `blueberry-muffins-2k9x`, which is
neither memorable nor shareable, and the collision rate grows with the user base.

Slugs were also immutable. `applyRecipeInput` deliberately returned the existing slug, so renaming a
recipe left a URL that no longer described its contents. That immutability was itself a workaround:
because the slug was the only public lookup key, changing it would have killed every link anyone had
ever shared.

## Decision

Recipe URLs become `/recipes/<userSlug>/<recipeSlug>`. Uniqueness moves from a global constraint to
`unique(author_id, slug)`, so each user gets an independent namespace and two cooks can both hold
`blueberry-muffins`. Renaming a recipe now regenerates its slug, and every retired slug is retained
so old links keep working.

### The namespace key is a new app-owned `users.slug`

`users.handle` mirrors Clerk's `username`: it is nullable, is overwritten on every `user.updated`
webhook, and is nulled on account deletion. A value the identity provider can change or remove
underneath us cannot be the first segment of every canonical URL.

`users.slug` is therefore introduced as `NOT NULL`, unique, and owned by the application. It is
backfilled from `handle`, else a slugified `name`, else an opaque `cook-<id>`. It remains
user-changeable, because a public namespace people are asked to share should be theirs to choose.

The existing `/cooks/[handle]` profile route continues to resolve by `handle` for now. Unifying the
two namespaces is deliberately deferred rather than bundled into a URL migration.

### Old links are retained forever

Two alias tables record history: `user_slug_aliases` for renamed user slugs and `recipe_slug_aliases`
for renamed recipe slugs. Both are seeded so that no URL that worked before the migration stops
working after it — in particular, `recipe_slug_aliases` is backfilled with every recipe's current
global slug, and the flat `/recipes/<slug>` form keeps resolving via a 308 redirect indefinitely.

### Aliases count as occupied

Slug allocation refuses any candidate held by a live row **or** by an alias in the same namespace.
The alternative — letting a released slug be re-claimed and having the live slug win — means an old
link silently starts resolving to a different recipe, possibly one belonging to someone else. Treating
aliases as occupied costs a slightly higher perturbation rate and buys the guarantee that a URL
always refers to the thing it originally referred to.

### Redirects are issued only after an access check

An alias lookup happens before authorization, but the redirect is emitted only once the viewer has
passed the same `canView` check the canonical route applies. An unauthorized viewer receives the
existing `notFound()`. Without this ordering, a redirect would confirm that a recipe exists and leak
its current owner and title to someone who has lost access to it.

### Account deletion rotates the namespace

`applyClerkUserDeletion` anonymizes personal data. A user-chosen public slug is personal data, so
deletion rotates `users.slug` to an opaque `cook-<random>` and drops that user's retained aliases.
This is the one place where link retention loses: keeping the old namespace resolving would defeat the
deletion request. Recipes remain reachable under the rotated namespace, so nothing that a viewer
could still legitimately see disappears.

### Renaming a recipe re-slugs it

Slugs used to be immutable: `applyRecipeInput` returned the existing slug, so renaming "Nonna's Ragu"
to "Sunday Ragu" left the URL saying `nonnas-ragu` forever. A rename now regenerates the slug and
retains the outgoing one, so the URL tells the truth _and_ every link ever shared keeps working.

Re-slugging is keyed off the **title**, not the derived slug. A recipe whose slug was perturbed
(`apple-pie-2ab`, because that cook already had an `apple-pie`) would otherwise churn to a fresh
random suffix on every unrelated save. Because an edit can now lose the same check-then-write race a
create can, `updateRecipe` and `revertRecipe` are wrapped in `withSlugConflictRetry` too.

### Legacy flat URLs resolve through a marked alias row

`recipe_slug_aliases.legacy` marks the rows seeded by the migration from the pre-namespacing global
slugs, with a partial unique index over just those rows. Since the source column was globally unique,
that index can never fail on seeding, and it keeps a flat `/recipes/<slug>` lookup unambiguous forever
even after later recipes claim the same slug in other namespaces. Bare id-or-slug reads that survive
the transition (`getRecipe`, `getOwnedRecipe`, `getPublicRecipeCard`, `forkRecipe`) order
deterministically — exact id first, then oldest holder — so no existing link changes meaning.

### The flat legacy route is a resolver, not a rewrite

`/recipes/<segment>` is kept as a real route (`src/app/(main)/recipes/[cook]/page.tsx`) that resolves
the segment and issues a 308 to the canonical namespaced URL, rather than a `next.config.js` rewrite
or middleware redirect. A rewrite cannot work here: the mapping is a database lookup (id → recipe,
then the `legacy` alias, then the oldest live holder), and — decisively — the redirect must be
withheld until the viewer has passed `canView`, which is server-component territory. Middleware runs
before auth context is fully available and would have to duplicate the access check.

The route also cannot shadow the static siblings `/recipes/new`, `/recipes/tags`, and
`/recipes/cook-with`: Next.js resolves static segments ahead of dynamic ones, so those pages continue
to win. That is why `RESERVED_RECIPE_SLUGS` is retained — it now constrains user slugs, and the
reservation for recipe slugs remains only so pre-existing flat links stay resolvable.

### Resolution is one function per URL shape

`src/server/recipes/resolve.ts` exposes exactly two entry points, both `cache()`-wrapped so a page and
its `generateMetadata` share a single query pass:

- `resolveNamespacedRecipe(cook, recipe)` — live slug, then retired recipe slug, then a bare id inside
  that namespace. A live slug always beats an alias, so a slug retired by one recipe and later
  re-issued never silently redirects to the earlier content.
- `resolveFlatRecipe(segment)` — id, then the seeded `legacy` alias, then the oldest live holder.

Both return `{ recipeId, canonical }`. Routes translate `canonical: false` into a
`permanentRedirect`, and only ever after the recipe has loaded for the viewer.

### Every recipe URL is built by `recipe-path.ts`

`recipeDetailPath` degrades in two steps — canonical `/recipes/<cook>/<slug>`, then flat
`/recipes/<slug>`, then `/recipes/<id>` — so a call site holding only a recipe row still emits a
working link that redirects, rather than a dead one. `recipeEditPath`, `recipeCookPath`,
`recipePrintPath`, and `recipeKeepsakePath` all compose on top of it, which is what keeps the
sub-routes correct now that they sit one segment deeper.

`recipeRevalidationPaths` is the fan-out counterpart: it returns the canonical path _and_ the flat
legacy path, because the App Router caches those as independent documents and inbound traffic to an
established recipe is mostly old links. Retired aliases are deliberately excluded — they are
redirects, not cached documents, and their target is already busted.

### Pre-cutover sub-route links are recovered by the two-segment route

A shared link like `/recipes/apple-pie/cook` has two segments after `/recipes`, so after the cutover it
matches `[cook]/[recipe]` as `cook="apple-pie", recipe="cook"` and resolves to nothing. Flat _detail_
links still worked (the one-segment resolver handles them), but every flat _sub-route_ link — the ones
people bookmark while cooking — 404ed.

`getNamespacedRecipeForViewer` therefore falls back: when the namespaced lookup misses and the second
segment is one of `cook`, `print`, `keepsake`, or `edit`, it re-resolves the first segment as a flat
recipe reference and the route 308s to `<canonical>/<sub-route>`, preserving the query string so a
shared keepsake link still arrives with its note. The fallback is only consulted _after_ the namespaced
lookup fails, so a cook who genuinely owns a recipe slugged `cook` still wins. It reuses the same
post-`canView` redirect discipline as every other alias, so it leaks nothing.

The alternative — registering explicit legacy routes — is impossible: Next.js will not accept
`/recipes/[slug]/cook` alongside `/recipes/[cook]/[recipe]`.

### Slug-only callers fan out across every namespace

Most engagement writes (comments, ratings, reviews, reactions, favorites, cook logs) receive only a
recipe _slug_ from the client. Slugs are no longer globally unique, so that slug cannot identify one
recipe. `revalidateRecipeSlugPaths` in `src/server/recipes/revalidate.ts` resolves every non-deleted
recipe holding the slug and busts each one's canonical path plus the shared flat path. Over-revalidating
is harmless — it only drops cache entries and returns nothing to the caller — whereas guessing an owner
and getting it wrong leaves the real canonical page stale, which is the actual user-visible bug.

### The embed iframe is keyed by id

`/embed/recipes/<id>` replaces the previous slug-keyed embed URL. Embeds are pasted into third-party
pages and never revisited, so keying them by a mutable slug would break silently on the first rename.
Ids are already exposed by the oEmbed payload and carry no additional information.

## Consequences

Reserved slugs move up a level. `new`, `tags`, and `cook-with` are static siblings under `/recipes/*`,
so they now constrain **user** slugs rather than recipe slugs. Because `edit`, `cook`, `print`, and
`keepsake` move to the third path segment, they stop shadowing recipe slugs entirely.

The App Router tree must be restructured. Next.js forbids two different dynamic segment names at the
same position, and `/recipes/[id]/edit` already occupied depth 2, so `[id]` is renamed and re-nested
to `[cook]/[recipe]` in both the `(main)` and `(immersive)` route groups, which must agree on segment
names.

Cache revalidation must fan out. Mutations previously revalidated a single path built from
`recipeDetailPath()`. A recipe now answers on its canonical path plus its legacy flat path plus any
alias paths, and every one of them must be revalidated or an edit will leave a stale page served.

Unlisted recipes are unaffected. `/r/<shareToken>` resolves through `getRecipeByShareToken` and never
depended on the slug, so the confidentiality boundary for unlisted recipes is unchanged.

## Alternatives considered

**Keep the global namespace and simply allow duplicates with longer suffixes.** Rejected: it does not
give users a namespace they control, and the suffixes get uglier as the product grows.

**Use Clerk's `handle` as the namespace.** Rejected for the nullability and external-mutability
reasons above.

**Expire aliases after a fixed window.** Rejected: the product's premise is that these recipes are
heirlooms shared within families over years. A link in a fifteen-year-old email should still work.

**Let a new recipe reclaim a freed slug, with the live slug winning over the alias.** Rejected on
security grounds: it silently redirects historical links to unrelated content.
