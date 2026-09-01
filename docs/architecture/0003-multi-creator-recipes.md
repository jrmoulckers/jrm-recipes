# ADR-0003: Multi-Creator Recipes

- **Status:** Accepted
- **Date:** 2026-08-10
- **Issue:** [#668](https://github.com/jrmoulckers/jrm-recipes/issues/668)
- **Builds on:** [ADR-0002](./0002-user-scoped-recipe-slugs.md)
- **Amended by:** [ADR-0009](./0009-account-deletion-and-shared-recipes.md)

## Context

A recipe had exactly one author. `recipes.author_id` was a `NOT NULL` FK, `canView` knew only
public/author/group-member/unlisted-by-token, and every write gate was a literal
`eq(recipes.authorId, viewer.id)` in a SQL `WHERE`. There was no collaborator concept anywhere —
the `suggestion_applied` event and its `contributorLabel` are attribution text merged into notes,
not authorship and not permissions.

Two people who cook a dish together therefore had no way to say so. The best available approximation
was for one of them to fork it, which produces two divergent recipes rather than one shared one.

ADR-0002 had just made each user's slug namespace independent, which is the missing half: if a
recipe can be named inside more than one namespace, one recipe can have more than one address.

## Decision

A `recipe_creators` join table, and per-creator namespaced URLs. One recipe resolves at
`/recipes/<owner>/<slug>` **and** at `/recipes/<creator>/<their-slug>` for each accepted creator.

### The owner is not a row

`recipes.author_id` is the sole owner and never appears in `recipe_creators`. A second
representation of the same fact could only drift. ADR-0009 later made the owner nullable so a
co-created recipe can survive account deletion without forcing ownership onto another person. The
ownerless state is explicit and claimable; claiming sets `author_id` and removes the claimant's
creator row in one transaction.

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

This is a deliberate exception to ADR-0002's rule that retired slugs are retained forever, and the
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

Co-creators can **read** a recipe, it answers at their address, and — since #685 — an accepted
co-creator can rewrite its body. Delete, restore, visibility, share-token rotation, version reverts
and creator management stay owner-only: a rewritten step is recoverable through `recipe_versions`,
a deleted or re-shared recipe is not.

That widening has a cost this ADR should name rather than bury. The write path no longer makes
"delete the recipes where `author_id = U`" a provable erasure of U's free text: a co-creator's prose
now lands in someone else's `recipes.story`/`notes` and, invisibly, in every
`recipe_versions.snapshot`, where no column-level scrub can reach it. `recipe_versions.authorId`
gives per-save attribution and is partial coverage only — it says who saved a revision, not which
sentences within it are theirs. That residue is the outstanding half of
[#678](https://github.com/jrmoulckers/jrm-recipes/issues/678), which shipped account erasure but
cannot yet reach contributions inside recipes the departing user does not own.

A source-level guard in `creator-escalation.test.ts` pins the boundary: `recipeCreators` may be
consulted only by the namespace-occupancy probe and `assertRecipeEditAccess` (the edit gate), and
the destructive mutations must stay `authorId`-scoped. Its earlier, absolute form — no write path
may consult `recipeCreators` at all — was written to fail at exactly the change that widened
writes, which is what it did.

One consequence lands directly in the write path: `updateRecipe` authorizes on the **actor** but
allocates against `current.authorId`. Those are two different users once a non-owner can edit, and
conflating them would mint the renamed slug in the _editor's_ namespace and retire the old one
there — silently occupying a slug the editor never asked for, while leaving the owner's canonical
path pointing at nothing. The editor's own `recipe_creators.slug` is a stable mirror address and
never moves on a rename.

### Erasure: this table is the survival predicate

`recipe_creators` is what account erasure asks "does this recipe outlive its owner?" — the answer
is simply whether an **accepted** creator remains, one indexed query. That is deliberate: the
survival rule and the co-creator relationship are the same fact, so erasure reads it directly
rather than maintaining a parallel notion of who a recipe belongs to. `recipe_creators.userId` is
`onDelete: cascade`, so a departing user's creator rows and mirror URLs disappear with them, and
because removal writes **no** alias row they leave no residual entry in any namespace either.

`recipes.authorId` is deliberately **`restrict`**, not `cascade` (changed by #678/#684). A cascade
would have been actively wrong here: it deletes every recipe the departing user owns, _including_
the ones with surviving co-creators that the retention exception says must live on, and it does so
before the erasure path can destroy the associated Cloudinary bytes. `restrict` turns an unhandled
dependency into a loud FK violation instead of irreversible data loss, and makes
`~/server/users/erasure.ts` — which reassigns or deletes each owned recipe in the right order —
the single place that decides a recipe's fate. See
[ADR-0004 (account erasure)](./0004-account-erasure.md).

Path revalidation now fans out across N namespaces instead of one.
`revalidateRecipePaths` discovers the current creators itself rather than trusting callers to pass
them, so no caller can forget half the fan-out. Accepting an invitation busts the **owner's**
canonical path as well as the new creator path, because the owner's byline gains a name at that
moment.
