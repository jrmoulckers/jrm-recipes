# ADR 0003: Account Deletion Is Full Erasure

- **Status:** Accepted
- **Date:** 2026-08-16
- **Issue:** [#678](https://github.com/jrmoulckers/jrm-recipes/issues/678)
- **Supersedes:** the "Account deletion rotates the namespace" decision in
  [ADR 0002](./0002-user-scoped-recipe-slugs.md)

## Context

Heirloom's account deletion was implemented for issue #217 and never revisited.
`applyClerkUserDeletion` fired on Clerk's `user.deleted` webhook and _anonymized_: it stamped
`deletedAt`, nulled `email` / `name` / `handle` / `avatarUrl` / `clerkId`, and rotated the public
slug. The `users` row itself survived, with a stable primary key and roughly 139 foreign keys still
pointing at it.

That is pseudonymization, not anonymization. Under GDPR Recital 26, data that can be re-attributed
to an individual using additional information is still personal data — and here the additional
information was sitting in the same database, spread across recipes, comments, ratings, reviews,
cook-log entries and version snapshots, all still keyed to the retained id. So the erasure request
was not remedied, only obscured. **This was a standing compliance gap in production, independent of
any feature work**, which is why it is recorded here rather than as a footnote to the URL change
that surfaced it.

Two further facts shaped the design:

- Recipes are free text. Titles, stories, hand-me-down attributions, notes, fork notes, journal and
  cook-log entries, and photographs all routinely carry personal data about the author and about
  third parties. There is no reliable way to scrub them field by field.
- `media_assets` is deliberately _additive_ bookkeeping, not a complete inventory of uploads, and
  the URL columns are what actually render. Anything that deletes rows without consulting both
  leaves images live on the CDN with nothing left pointing at them.

## Decision

**Account deletion is a full data deletion, not anonymization.** The `users` row is deleted, the
Cloudinary bytes are destroyed, and the ~139 cascading foreign keys remove the rest.

### The co-creator exception, and its asymmetry

A recipe with other creators survives; only the departing user's creator link is removed.

Today that exception can only ever apply in the direction that is safe. `recipe_creators` (#668)
grants read access and a mirrored namespace, and every write path still gates on
`eq(recipes.authorId, …)`. A non-owner creator has therefore authored none of the recipe's free
text, and deleting their row genuinely erases everything of theirs the recipe holds.

The reverse is deliberately **not** treated as survival. When the _owner_ departs, the entire body
is their personal data, so "the recipe survives with the byline removed" would retain 100% of their
free text under someone else's namespace — precisely the pseudonymization failure that motivated
this ADR. Their recipes are deleted. Because that is a real loss to the co-creators, the departing
owner is offered **ownership transfer before confirming**, so retention becomes their consented act
rather than a silent default.

A `pending` invitation grants nothing and has no slug, so it never makes a recipe "co-created" for
survival purposes.

**Precondition on widening writes.** If cross-owner editing ever ships, this reasoning expires:
the departing user's prose would live inside someone else's `recipes.story` / `notes` and,
invisibly, in every `recipe_versions.snapshot` jsonb — reachable by no author-scoped delete. The
separability mechanism is derived provenance: `recipe_versions` carries `authorId` plus a full
snapshot per save, so diffing a user's versions against their predecessors yields exactly the text
they introduced, with no new attribution table. **Ordering hazard:** erasure deletes those version
rows, which destroys the diff basis. Any future revert must be computed and applied _first_.

### Ordering is enforced by the schema, not by discipline

`recipes.authorId` and `media_assets.userId` change from `cascade` to `restrict`. A cascade would
pull recipes and media bookkeeping out from under the erasure logic silently; `media_assets` is the
worst case, because the row is the only record that a Cloudinary asset exists, so cascading it
destroys the bookkeeping without ever calling `uploader.destroy`. With `restrict`, a missed step is
a loud foreign-key violation instead of irreversible data loss.

The order is therefore: destroy remote bytes → **abort the whole erasure if any survived** → delete
rows inside one transaction → delete the `users` row → assert nothing remains → write the tombstone.
A retryable partial failure is strictly better than a half-erased account that everyone believes is
gone.

### The tombstone stores hashes and counts only

`deletion_records` outlives the row it describes, for two reasons: evidencing the erasure
(Art. 5(2)) and re-applying it after a backup restore, which needs to know _who_ to re-erase after
the only identifying row is gone.

A record rich enough to be useful would re-create the profile the erasure just removed, so
identifiers are stored only as **salted** SHA-256 (`DELETION_HASH_SALT`). Salted, not bare: a plain
hash of a known cuid2 is trivially confirmable by anyone holding the table. No email, name, handle,
slug, raw id, recipe title, or any free text is stored — counts and hashes only.

### Freed URLs return 404, and the slugs become claimable

The deleted user's slug and all their aliases go with the account, so previously shared
`/recipes/<their-slug>/<recipe>` links stop resolving.

**404, not 410.** A 410 asserts that the resource existed and is permanently gone, which confirms a
recipe once lived at that URL. That breaks the invariant from ADR 0002 that an unauthorized viewer
is indistinguishable from a nonexistent one, and would turn deletion into an enumeration oracle.

**The slugs become claimable again**, which is consistent with ADR 0002's alias-occupancy rule: that
rule makes an alias _row_ occupy a slug, and here the rows are deleted, so nothing occupies it.

## Accepted risk: reclaimed namespaces

Freeing a departed user's slug means an old shared link can later land in a stranger's namespace,
and if that stranger happens to hold a same-named recipe, the link serves their content under the
old address. Reserving the slug forever was proposed and **rejected by the product owner**, who
weighed the link-hijack risk against permanently burning namespaces and chose reuse.

Recorded here as a deliberate trade-off rather than an oversight. Owner: the product owner (#678).

It is contained, not eliminated:

- Resolution is **exact-match only**. `resolveNamespacedRecipe` returns null the moment the cook
  segment resolves to nobody, and never falls back to a global slug lookup, a fuzzy match, or
  another namespace. Covered by tests in `src/server/recipes/resolve.test.ts`.
- Every probe is scoped to the resolved namespace holder's id, so a result is unambiguously the
  current holder's own content.
- No stale attribution survives the handover: cached pages, sitemap entries, oEmbed responses and
  OG images are all keyed off data that is deleted with the account.

The residual — a reclaimed slug serving the new holder's same-named recipe — is the accepted part.

## Consequences

- Deletion is irreversible. There is no undo, and the pre-deletion export
  (`/api/backup`) is the only recovery path, which is why the confirmation flow must offer it.
- Restoring a backup taken before an erasure resurrects the deleted user.
  `docs/db-backup-and-recovery.md` gains a mandatory re-application gate before a restored instance
  can be promoted.
- Erasure cannot complete while Cloudinary is unconfigured and the user has destroyable assets. This
  is intentional: it fails loudly and is retryable.
- Deletion is coupled to the multi-creator subsystem (#668): "does this recipe survive?" is exactly
  "does it have another accepted creator?".
