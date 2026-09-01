# ADR-0009: Account deletion retains shared recipe contributions without identity

- **Status:** Accepted
- **Date:** 2026-08-31
- **Issue:** [#694](https://github.com/jrmoulckers/jrm-recipes/issues/694)
- **Supersedes in part:** [ADR-0003](./0003-multi-creator-recipes.md) and
  [ADR-0004](./0004-account-erasure.md)

## Context

Accepted co-creators can edit a shared recipe body. Deleting a contributor's account therefore
cannot remove everything they wrote without reconstructing later collaborators' work. The previous
policy held every deletion involving a co-created recipe because deleting the account also removed
the attribution needed for a future reconstruction.

The product decision is not to reconstruct shared history. A shared recipe is a collaborative
document: accepted contributions remain part of it after an account is deleted, while every live
reference to the former account is removed.

This is not unconditional "full erasure." Recipe prose, version snapshots, timestamps, and images
may remain identifying from their content or family context even after account attribution is gone.
The product must describe the operation as deleting the account and personal profile, with the
shared-content exception stated before confirmation.

## Decision

### Shared contributions survive without an account reference

When a departing user contributed to a recipe owned by someone else:

- the current recipe text and media remain unchanged;
- their accepted `recipe_creators` row and user reference are deleted;
- their retained version rows remain, with `author_id` set to `NULL`;
- null version authors render as **Unknown contributor**;
- no hidden contributor identifier or hash is added to retained content.

The pre-deletion export includes a distinct section for contributions to shared recipes, including
the user's attributed version snapshots and media references. After deletion, a former user may
request removal of identifiable retained content by supplying the recipe URL and the specific text
or image. Support verifies and handles that request without a persistent subject-to-contribution
index.

### Shared media receives a lifecycle custodian

Media bytes that remain reachable from a retained recipe are not purged with the departing account.
Their bookkeeping must move before the user row is deleted:

- media used by recipes with an owner transfers to the owner of the oldest retained recipe that
  references it; other recipes may continue referencing the same bytes;
- media belonging to a recipe that becomes unclaimed is held by that recipe as system-custodied
  media, not forced onto a co-creator;
- all remaining user-owned media is destroyed through the normal verified Cloudinary purge.

`media_assets` therefore has exactly one lifecycle custodian: a user or an unclaimed recipe. A
recipe claim transfers its system-custodied media to the claimant. The recipe relationship is
restrictive so deleting a row can never discard the only Cloudinary bookkeeping without first
handling the remote bytes. Bookkeeping persists Cloudinary's `image`, `video`, or `raw` resource
type so terminal deletion never guesses the wrong API namespace. When a non-public ownerless recipe
loses its final creator, its recipe-custodied bytes are destroyed before the recipe is soft-deleted.

### Recipes may become unclaimed

If a departing owner has at least one accepted co-creator, the recipe survives with
`recipes.author_id = NULL`. Otherwise it follows the existing deletion path.

An unclaimed recipe:

- has `/recipes/unclaimed/<recipe-id>` as its canonical URL;
- remains reachable through each accepted co-creator's mirror URL;
- keeps its existing visibility and access checks;
- may still be edited by accepted co-creators;
- has owner-only operations disabled until it is claimed;
- renders the missing owner as **Unknown contributor**.

If the final co-creator leaves an unclaimed recipe, a public recipe remains as archival public
content. A private, group, or unlisted recipe is deleted through the normal recipe deletion
lifecycle. Public unclaimed content with no remaining creators may be removed only by support after
a verified content-removal request.

### Claiming is explicit and first-writer-wins

Any accepted co-creator may explicitly claim an unclaimed recipe. The first successful transaction
wins. The transaction:

1. verifies that the recipe is still unclaimed and the claimant is still accepted;
2. serializes namespace allocation with the existing namespace lock;
3. promotes the claimant's mirror slug to the recipe's canonical slug;
4. sets `recipes.author_id` to the claimant;
5. removes the claimant's `recipe_creators` row, because the owner is never duplicated there;
6. transfers system-custodied media to the claimant;
7. records the ownership change and revalidates every affected route.

Account deletion and creator membership changes serialize on the recipe row. Deletion holds those
locks while it reclassifies survival, transfers custody, verifies remote purge, mutates recipes,
deletes the account, and writes evidence in one database transaction. A concurrently accepted
invitation therefore resolves wholly before or after the deletion decision, never between planning
and destruction.

The unclaimed URL checks visibility before permanently redirecting to the new canonical owner URL.
This prevents an old private URL from revealing either the recipe or its claimant.

### Account-deletion notice and evidence

The confirmation surface is titled **Delete account and personal profile**. It separately states
and counts:

- owned recipes that will be deleted;
- owned recipes that will become unclaimed;
- shared contributions and version history that remain without account attribution;
- retained media whose lifecycle custody changes;
- pending invitations, subscriptions, groups, and links affected by deletion.

The notice does not claim to cancel processor billing. A user with an active subscription is told
to cancel it in Billing before deleting the account.

The notice says that retained text and images may still identify the person from their content. Its
version is recorded in `deletion_records`. The tombstone stores counts only and never stores recipe
ids, titles, media URLs, or a contributor linkage.

## Consequences

- The co-creator erasure hold is no longer needed for new requests once this behavior is deployed.
  Existing holds must be replayed through the same account-deletion path.
- `recipes.author_id` is nullable, so every recipe query and renderer must model a genuinely absent
  owner rather than fabricating a user.
- Shared contribution retention needs an approved lawful basis and public policy language outside
  this engineering decision. This ADR records product behavior, not legal sign-off.
- `recipe_versions` remains load-bearing family history and follows the retained recipe's lifetime.
- The Neon backup horizon remains independently blocked on
  [#855](https://github.com/jrmoulckers/jrm-recipes/issues/855) and
  [#806](https://github.com/jrmoulckers/jrm-recipes/issues/806).
