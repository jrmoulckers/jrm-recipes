# Dietary retention and rights

**Status:** Required behavior for issue
[#1106](https://github.com/jrmoulckers/jrm-recipes/issues/1106). The implementation-specific
statements below were reconciled with the merged schema/authorization, analytics, and account-bound
cleanup controls. Proposed retention periods and production-enable decisions remain conditional on
the human gates below.

This is an engineering and product contract, not legal advice. Qualified legal review remains a
production-enable gate in
[the dietary data inventory and DPIA](./dietary-data-inventory-and-dpia.md).

## Classification and ownership

Dietary data has two structurally separate scopes:

| Scope                       | Includes                                                                                                                                                                                     | Owner and authorization                                                    | May be public or retained with a shared recipe?                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipe-level built-in facts | Evidence and current assessment for a registry-defined built-in rule, freshness metadata, and a schema-constrained recipe correction authorized under recipe rules                           | The recipe authorization boundary. Actor attribution remains personal data | A dedicated allowlisted projection may expose current facts. Only facts/corrections with no personal text/context may follow a retained recipe after actor de-attribution |
| Profile-personal data       | Profile name, built-in selections, custom restriction names/terms/severity, personalized assessment, private correction, profile linkage, manager/subject relationship, and enablement state | The profile creator only in v1                                             | Never. It cascades with the profile/restriction/account and cannot be transformed into a recipe fact by removing a name                                                   |

An optional profile `groupId` is context for organizing a creator's own data. It does not:

- share the profile with group owners, admins, or members;
- prove who the profile describes;
- establish a guardian or manager relationship;
- authorize export, correction, deletion, or personalized assessment access;
- permit a public or shared projection.

Every profile operation must authorize the creator directly. Recipe and profile authorization are
checked independently when a personalized assessment touches both.

Model-assisted/custom-restriction processing is self-only in v1. A minimal non-identifying
subject-scope declaration is required before either capability runs. Missing, non-self, or disputed
status must be rejected at the server mutation/persistence boundary until the qualified-human
rights process in the dietary DPIA is approved and implemented.

## Purpose-bound retention schedule

The periods below are proposed engineering limits. Legal, product, privacy, and operations owners
must approve them before production enablement.

| Data                                                                    | Retention trigger and maximum                                                                     | End-of-life action                                                                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current recipe-level built-in fact                                      | While the recipe exists and the fact is current for its ingredient fingerprint/ruleset            | Delete with the recipe. If the recipe survives account deletion under ADR-0009, retain the current fact but remove actor/profile/custom-restriction linkage |
| Invalidated or superseded recipe-level assessment/evidence              | No more than 30 days after invalidation or supersession, solely for rollback and explainability   | Hard-delete structured rows or compact them to non-personal aggregate operational evidence; never serve them as current                                     |
| Current schema-constrained recipe correction                            | While the corrected ingredient/fact remains in the recipe and the correction is current           | Retain after actor erasure only if every value belongs to an allowlisted non-personal schema; otherwise delete the correction content                       |
| Free-text, private, or identifying correction content                   | Only while its authorized correction purpose remains                                              | Delete on profile/account erasure even when the recipe survives; actor nulling alone is insufficient                                                        |
| Superseded correction version                                           | No more than 30 days after supersession                                                           | Hard-delete content and actor linkage                                                                                                                       |
| Profile and custom restriction                                          | Until explicit removal, profile deletion, or account erasure                                      | Cascade-delete from the live store and purge account-bound local copies                                                                                     |
| Current personalized assessment/correction                              | While the profile/restriction exists, recipe access remains authorized, and the result is current | Delete on profile/restriction/account deletion or lost recipe access; never retain with a shared recipe                                                     |
| Stale personalized assessment                                           | No more than 30 days after invalidation or loss of purpose                                        | Hard-delete from server and local stores                                                                                                                    |
| Rejected assessment submission payload                                  | No retention                                                                                      | Reject without storing or logging the payload                                                                                                               |
| Rejection status/reason                                                 | No more than 30 days; fixed bounded reason and timestamp only                                     | Hard-delete or aggregate without subject/content linkage                                                                                                    |
| Smart-analysis enablement                                               | Latest state, notice version, and timestamps for account lifetime                                 | Delete on account erasure. Do not keep an unbounded event history or call this analytics/legal consent                                                      |
| In-memory model worker/job state                                        | Only while a permitted analysis is active                                                         | Cancel and release immediately on disable, sign-out, account switch, deletion completion, or page/runtime teardown                                          |
| Account-bound model, analysis, IndexedDB, and personalized recipe cache | Maximum age 30 days and only while the owning identity remains current                            | Purge on disable, sign-out, account switch, and deletion completion. Never reuse account A data for account B                                               |
| Model binary after plan downgrade                                       | No new analysis is permitted. Retention is undecided                                              | Product must explicitly approve keeping static bytes; personalized outputs/jobs must still be removed                                                       |
| Dietary raw analytics events                                            | Proposed maximum 90 days                                                                          | Delete raw events. Longer trends require documented anonymous aggregation with no account or dietary linkage                                                |
| Dietary operational logs                                                | Maximum 30 days                                                                                   | Delete. Logs contain fixed codes/counts only, never content, ids, severity, verdicts, evidence, corrections, fingerprints, or raw exceptions                |
| Database backup copies                                                  | Actual Neon production history window                                                             | Keep beyond use only; never selectively edit an immutable backup; re-erase before restored data serves traffic; expire with provider window                 |
| Deletion evidence                                                       | Existing account-erasure evidence period                                                          | Counts and salted hashes only. Never store dietary text, ids, profile links, verdicts, or fingerprints                                                      |

The 30-day and 90-day values are upper bounds, not minimums. If the implementation does not persist
a category, it must not add persistence merely to satisfy this schedule.

## Access and export

The authenticated account export must remain available on Free and after downgrade. It must be
portable, no-store, rate-limited, and scoped to the requester.

Required dietary sections:

- profiles, nutrition-target history, and custom restrictions owned by the requester;
- the requester's current personalized assessments and corrections;
- the requester's creator/actor-attributed recipe-level facts and corrections when they can be
  exported without revealing another person's profile;
- enablement state and notice version if persisted;
- plain metadata describing freshness and provenance without model traces or chain-of-thought.

The export must not include:

- another creator's profile or custom restriction;
- a personalized verdict for another profile;
- data reached only because a profile or recipe has the same `groupId`;
- another person's private correction;
- internal security fields, deletion hashes, raw model output, or rejected payloads.

Recipe-level facts that are not requester-owned or requester-attributed remain part of the recipe
export only when the requester already has access to that recipe and the normal recipe export
contract includes them. A data-access request is not a new grant to someone else's recipe.

## Correction

- The creator can edit or delete their profile, custom restriction, severity, and approved aliases.
- Correcting profile-personal data recalculates or invalidates dependent personalized assessments.
- Authorized recipe editors correct recipe ingredient evidence under the recipe boundary.
- A profile creator who is not authorized to edit the recipe cannot turn a private correction into
  a shared recipe fact.
- A correction may survive account erasure only when its persisted representation is an allowlisted,
  schema-constrained recipe fact with no free text, health narrative, private context, or indirect
  identifier. Nulling the actor on arbitrary content is not de-identification.
- Deterministic conflicts cannot be overridden by model output or a confirmation. The underlying
  ingredient/evidence must be corrected.
- Rights access, correction, and deletion cannot be paywalled.

## Profile deletion and account erasure

Deleting one profile must remove:

- the profile and custom restrictions;
- personalized assessments and private corrections linked to it;
- account-bound local profile/analysis caches;
- pending jobs that could recreate the deleted result.

It must not delete or alter recipe-level built-in facts solely because that profile previously used
them.

Account erasure must additionally:

1. include dietary rows in the deletion plan and aggregate preview counts;
2. remove all profile-personal rows and enablement state;
3. retain only schema-constrained current recipe-level built-in facts/corrections with no personal
   text or context when the recipe survives under ADR-0009; delete all free-text, private, or
   identifying correction content before removing creator linkage;
4. ensure no retained fact carries a profile id, custom restriction id/name, severity, personalized
   verdict, or hidden subject/manager linkage;
5. write aggregate deletion/retention counts only to the tombstone;
6. assert after commit that no profile-personal or actor-attributed dietary row still names the
   erased user;
7. invoke account-bound client cleanup on successful deletion completion;
8. preserve the support route for removing identifiable retained recipe content.

The deletion notice version must change when this distinction becomes real in production. The
notice must separately state that:

- profiles, custom restrictions, personalized assessments, and private corrections are deleted;
- current built-in recipe facts may remain with a retained shared recipe without account/profile
  linkage;
- retained recipe text or images may still identify the person from context under ADR-0009;
- backup copies remain beyond use until the configured provider history window expires and are
  re-erased on restore.

Do not state a numeric backup horizon until #855 pins the actual Neon setting and #806 wires
`backup_horizon_at`.

## Retained shared recipes

When account deletion retains a recipe under ADR-0009:

| Data associated with that recipe                               | Result                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| Current built-in rule fact with no profile/custom linkage      | Retain with the recipe if still current                         |
| Actor attribution on a schema-constrained non-personal fact    | Set to `NULL` or otherwise remove the live user reference       |
| Free-text, private, or identifying correction content          | Delete; actor nulling alone is insufficient                     |
| Personalized profile assessment                                | Delete                                                          |
| Custom restriction assessment/evidence                         | Delete                                                          |
| Profile/custom restriction id, name, severity, or manager link | Delete; it must never have entered the shared projection        |
| Invalidated/superseded dietary history                         | Purge within 30 days rather than retaining it as recipe history |
| Tombstone evidence                                             | Aggregate counts only                                           |

No hidden subject-to-recipe index or hash may be introduced to reconnect an erased profile to the
retained recipe.

## Backups and restore

Dietary rows use the same Neon database backup boundary as the rest of the account:

- live-store deletion occurs through the normal profile/account path;
- immutable backups are not selectively edited;
- deleted data is beyond use and available only to the restricted recovery process;
- a restored instance cannot serve traffic until the existing salted-hash re-erasure gate reports
  no resurrected subjects;
- restore verification must include the dietary profile/personal tables delivered in #1116 and
  confirm retained recipe facts contain no erased profile or actor link;
- client model/IndexedDB/cache data is not restored from Neon and is handled by the account-bound
  cleanup coordinator delivered in #1115 and extended by #1106.

The production notice must use the actual longest retention period, not the current unpinned
recommendation in [the backup runbook](../db-backup-and-recovery.md).

## Disable, sign-out, account switch, and downgrade

One account-bound cleanup coordinator owns transition cleanup. Dietary code registers handlers
rather than creating a second identity observer.

The current coordinator runs on sign-out/account switch, successful account deletion, and profile
deletion. It stops registered dietary runtime work with a bounded acknowledgement before deleting
named Cache Storage and IndexedDB data, and returns fixed handler outcomes without exposing raw
storage errors. A one-way local owner marker binds persistent stores to the current account across
browser restarts; unknown or mismatched ownership purges before it is trusted, and unavailable
Web Crypto or local storage fails closed by purging again on the next mount. A successful signed-out
purge writes a non-personal clean-state sentinel, so a missing marker is never interpreted as proof
that account-bound storage is empty. Model-assisted analysis has no production enable/disable
surface yet; introducing one requires invoking the same coordinator before that surface may ship.

On disable, sign-out, account A to B switch, and deletion completion, the implementation must:

1. prevent new jobs from starting;
2. cancel active workers and analysis queues;
3. wait only for bounded cancellation/acknowledgement and never block navigation indefinitely;
4. purge account-bound model, analysis, IndexedDB, and personalized recipe-page artifacts;
5. tolerate unavailable Cache Storage/IndexedDB while reporting through fixed non-content codes;
6. remain idempotent under repeated Clerk/provider transitions.

Downgrade is different from disable. It stops new premium analysis and refreshes but does not hide
existing results, corrections, restrictions, export, or deletion. Keeping static model bytes for a
future resubscription is a product decision; keeping personalized cache data is not permitted.

## Analytics and logs

The merged runtime boundary is reused and verified here rather than duplicated:

- an exhaustive typed event map for coarse enablement, download, device support, analysis outcome,
  trigger, and fixed errors;
- exact whole-event runtime validation in client tracking, server capture, and PostHog
  `before_send`;
- rejection of unknown `dietary_*` events, extra keys, nested objects, and unbounded values;
- canary tests proving ingredient/restriction content and identifiers, profile/recipe/rule ids,
  `groupId`, household/group identifiers, subject/manager relationship fields, severity,
  verdict/conflict, evidence, corrections, fingerprints, model input/output, and raw errors never
  reach transport;
- analytics consent and GPC/DNT remain independent from smart-analysis enablement.

Application logs follow the same forbidden-content list. A failure is represented by a fixed code
and, where needed, a count. It never interpolates an exception, request body, model result, recipe,
profile, ingredient, restriction, `groupId`, household/group identifier, or subject/manager field.

## Localized notice and copy requirements

Source copy must receive product and qualified legal review before translation. Runtime keys should
be semantic, use whole ICU messages, preserve named placeholders, and be added to all supported
catalogs:

| Semantic area (implemented or required)                          | Required message                                                                                                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dietary.fields.familyGroupPrivacy`                              | The profile is private to its creator; choosing a family group organizes it but does not share it                                                          |
| `dietary.customRestrictions.subjectScope` and `subjectScopeHelp` | Model-assisted/custom processing is self-only until an approved child/non-user rights process exists                                                       |
| `dietary.customRestrictions.subjectScopeRequired`                | A complete-sentence validation error when subject scope is missing, non-self, or disputed                                                                  |
| `dietary.smartAnalysis.setup`                                    | Optional on-device processing, model download size/storage, no cloud inference, and a clear enable action                                                  |
| `dietary.smartAnalysis.unsupported`                              | Deterministic checks remain available; unsupported hardware does not imply reduced safety or failure                                                       |
| `dietary.smartAnalysis.disable`                                  | Disabling stops work and removes account-bound model/analysis caches while preserving server-held rights                                                   |
| `dietary.smartAnalysis.downgrade`                                | New premium analysis stops; existing restrictions, corrections, results, export, and deletion stay available                                               |
| `dietary.export.description`                                     | Which creator-owned profiles, restrictions, assessments, and corrections are included                                                                      |
| `dietary.profileDelete.description`                              | Profile-personal data and local artifacts are deleted; recipe-level built-in facts are not                                                                 |
| `settings.dataPage.delete.consequences.dietary`                  | Account deletion removes profile-personal dietary data but current built-in facts may remain with a retained shared recipe without account/profile linkage |
| `settings.dataPage.delete.consequences.backups`                  | Deleted database data remains beyond use only for the approved backup horizon and is re-erased on restore                                                  |
| `dietary.limitations`                                            | Results do not prove brand, cross-contact, preparation, certification, or medical suitability                                                              |

Implementation must:

- update `src/messages/en.json`, `es.json`, `de.json`, and `ar.json` together;
- use ICU plural/select syntax for counts instead of English branching;
- keep legal/privacy sentences intact rather than concatenating fragments;
- test placeholder parity and the repository copy checks;
- test long German/Spanish copy, narrow layouts, large text, and Arabic RTL order;
- avoid inventing regulated wording in translation. Unapproved source copy blocks translation and
  production enablement.

## Release evidence

Release evidence must link:

- #1116 schema/authorization/export/erasure and public-projection tests;
- projection and erasure tests proving retained correction values are schema-constrained and that
  free-text/private/identifying content is deleted rather than merely de-attributed;
- server-boundary tests proving missing, non-self, and disputed subject scope cannot run or persist
  custom/model-assisted processing;
- #1113 analytics allowlist and canary tests;
- #1115 account-transition cleanup and cache-isolation tests;
- retention enforcement for every persisted stale/rejected category;
- the authenticated daily dietary-retention job and its aggregate-only result;
- localized notice/version tests;
- a named model asset distributor decision;
- the actual Neon backup horizon and restore drill evidence;
- recorded qualified legal/product/operations decisions from the DPIA gates.

Passing engineering tests does not represent legal approval. The production feature remains
disabled until every human-owned gate is resolved.
