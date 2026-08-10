# ADR 0003: Multi-Creator Recipes

- **Status:** Accepted
- **Date:** 2026-08-10
- **Issue:** [#668](https://github.com/jrmoulckers/jrm-recipes/issues/668)
- **Builds on:** [ADR 0002](./0002-user-scoped-recipe-slugs.md)

## Context

A recipe had exactly one author. `recipes.author_id` was a `NOT NULL` FK, `canView` knew only
public/author/group-member/unlisted-by-token, and every write gate was a literal
`eq(recipes.authorId, viewer.id)` in a SQL `WHERE`. There was no collaborator concept anywhere —
the `suggestion_applied` event and its `contributorLabel` are attribution text merged into notes,
not authorship and not permissions.

Two people who cook a dish together therefore had no way to say so. The best available approximation
was for one of them to fork it, which produces two divergent recipes rather than one shared one.

ADR 0002 had just made each user's slug namespace independent, which is the missing half: if a
recipe can be named inside more than one namespace, one recipe can have more than one address.

## Decision

A `recipe_creators` join table, and per-creator namespaced URLs. One recipe resolves at
`/recipes/<owner>/<slug>` **and** at `/recipes/<creator>/<their-slug>` for each accepted creator.

### The owner is not a row

`recipes.author_id` stays the sole owner and never appears in `recipe_creators`. A second
representation of the same fact could only drift, and the `NOT NULL` FK already guarantees exactly
one owner for the life of the recipe. This is also what makes the zero-creator state unreachable:
there is always at least one namespace the recipe answers in, so no "recipe with no URL" case has
to be designed. Ownership transfer, if it is ever built, is a swap of `author_id` plus a row move
inside one transaction.

### Consent is two-sided

An invitation is a `pending` row with no slug. It grants nothing: no access, no URL, no signal
beyond the notification. Access and the namespace slug are both created in the accepting
transaction, and a DB CHECK ties `slug`/`accepted_at` to `status` so a half-applied acceptance is
not representable.

Owner-side consent alone is not enough because adding a creator does two things at once. It grants
access to someone else's recipe — which the owner may authorize — and it publishes that recipe
under the invitee's _public namespace_, which changes the invitee's identity rather than their
permissions. Only they can consent to that.

### Removal frees the slug and writes no alias

This is a deliberate exception to ADR 0002's rule that retired slugs are retained forever, and the
difference is a trust boundary. A rename alias stays within one owner: the same person still holds
the recipe, so the redirect is honest and retention is free. An ex-creator's alias would point
across a relationship that was just revoked, and would either leak the recipe's continued existence
and current canonical URL to anyone holding the old link, or permanently burn a slug in the
ex-creator's own namespace as a side effect of losing access.

So removal hard-stops: the row goes, the slug is immediately free again, and the path 404s as if it
had never resolved. Anything less means removal does not actually revoke. No ambiguity follows,
because the only party who can re-claim the freed slug is the ex-creator, inside their own
namespace.

Revocation has a cache half as well. The removed creator's path must be revalidated _after_ the
delete, or the App Router keeps serving their page from cache after their access ended. The removal
returns the freed namespace precisely so the caller can purge a path that can no longer be
discovered from the database.

### The owner's URL is canonical; creator URLs are mirrors

Creator paths render **200 with `rel=canonical`** pointing at the owner's path, not a 308.

- Not canonical, because one recipe needs one indexable URL or the SEO signal splits N ways.
- Not a redirect, because 308ing would take a creator off the URL they just shared, which is most of
  the point of giving them one.

`resolveNamespacedRecipe` returns a `"canonical" | "mirror" | "alias"` union rather than a boolean,
so a call site cannot silently fold the third case into one of the other two. The sitemap lists
owner paths only: submitting mirrors would offer URLs the canonical tag immediately asks the crawler
to discard.

### Namespace occupancy is guarded by an advisory lock

A user's slug namespace is now shared by three tables — `recipes`, `recipe_slug_aliases`, and
`recipe_creators` — each carrying its own unique constraint. Postgres has no cross-table unique, so
two transactions (one accepting an invitation, one creating a recipe) could both probe a candidate
as free and both commit into different tables. Nothing would be violated, so the existing
`withSlugConflictRetry` would never retry, and the namespace would hold a duplicate the resolver
cannot disambiguate.

`slugTaken` takes a transaction-scoped advisory lock on the namespace before probing all three. A
shared occupancy table was the alternative and would have restored a single DB-enforced constraint,
but it adds a migration, a backfill from two sources, and a fourth place that must be kept in step.
The lock was preferred because `slugTaken` is the _only_ occupancy oracle and allocating a slug
means calling it — so the lock is structurally impossible to forget, whereas an occupancy-table
insert on a new code path is exactly the kind of thing that gets forgotten. The three constraints
remain the source of truth; the lock only closes the window between the probes.

Every allocating transaction locks at most one namespace, so no deadlock cycle exists. If a future
change needs two, they must be acquired in sorted owner-id order.

## Consequences

Co-creators can **read** a recipe and it answers at their address, but they still cannot write to
it. That gap is deliberate. Today's one-author invariant is what makes "delete the recipes where
`author_id = U`" a provable erasure of U's free text, which [#678](https://github.com/jrmoulckers/jrm-recipes/issues/678)
depends on. The moment a creator can edit a recipe they do not own, their prose lands in someone
else's `recipes.story`/`notes` and, invisibly, in every `recipe_versions.snapshot` — where no
column-level scrub can reach it. Widening writes therefore has to land together with contribution
provenance, not before it. A source-level guard test fails if a write path starts consulting
`recipe_creators`, as a prompt to revisit that decision rather than a bar on making it.

One consequence is already visible in the write path: `reslug` allocates against `author.id`, so if
a non-owner could edit, the new slug would be minted in the _editor's_ namespace and the old one
retired there. That has to be fixed as part of widening writes.

Path revalidation now fans out across N namespaces instead of one.
`revalidateRecipePaths` discovers the current creators itself rather than trusting callers to pass
them, so no caller can forget half the fan-out.
