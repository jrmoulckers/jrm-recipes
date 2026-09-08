# Dietary data inventory and DPIA

**Status:** Engineering draft for issue [#1106](https://github.com/jrmoulckers/jrm-recipes/issues/1106).
This document records the proposed processing boundary and controls. It is not legal advice,
does not record legal approval, and does not authorize production enablement.

The feature design is controlled by
[ADR-0011](../architecture/0011-evidence-based-dietary-assessments.md). The retention and rights
contract is in [dietary-retention-and-rights.md](./dietary-retention-and-rights.md). Both documents
must be checked against the implementation after issues #1101, #1107, and #1109 land.

## Scope and fixed product boundaries

- Dietary profiles are private, creator-controlled notes in v1.
- A profile's optional `groupId` is organizational context only. It is not a sharing grant, subject
  identity, guardian relationship, or authorization shortcut.
- Profile names, custom restriction names, severities, personalized assessments, and private
  corrections must not enter public or shared recipe projections.
- Only recipe-level assessments against built-in rules may be reused with a recipe, including a
  recipe retained under [ADR-0009](../architecture/0009-account-deletion-and-shared-recipes.md).
- Smart-analysis enablement is separate from analytics consent and from any consent or lawful-basis
  record that legal review may require.
- No date of birth, guardian identity, diagnosis, or new subject account is collected by this
  feature. Before model-assisted/custom-restriction processing, the creator must make a minimal
  non-identifying subject-scope declaration that the profile describes themself. Missing,
  non-self, or disputed status blocks the server-side operation and persistence unless a
  qualified-human-approved rights process is implemented. A later profile-sharing or
  subject-linking design requires a new review.
- On-device interpretation has no cloud inference fallback. Recipe, ingredient, profile, and
  restriction content must not be sent to the model asset host.

## Data inventory and RoPA input

This table is a factual engineering inventory plus proposed controls. The lawful-basis column is a
question for qualified legal review, not a determination.

| Data category                                         | Subject and source                                                                                                                   | Purpose                                                                                     | Sensitivity                                                                                       | Storage and recipients                                                                                           | Access and disclosure                                                                                                                                                                        | Retention and rights                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile name and built-in restrictions                | The account holder enters notes about themself or a person they cook for                                                             | Personalize warnings, evidence, filtering, and planning                                     | Health-adjacent; may reveal allergy, intolerance, religion, or other special-category information | Neon through the Vercel application boundary; encrypted browser transport; provider backups                      | Profile creator only in v1. `groupId` never grants access. Never public                                                                                                                      | Until profile removal or account erasure; exportable and correctable by the creator                                                                                  |
| Custom restriction name, terms, aliases, and severity | Profile creator after declaring that the profile describes themself                                                                  | Apply creator-approved exact restrictions and presentation behavior                         | Free text and severity can reveal health or belief information                                    | Neon and backups; Vercel handles the request                                                                     | Creator-controlled and profile-bound. Never a shared recipe fact or analytics property                                                                                                       | Until restriction/profile deletion or account erasure; stale derived results expire separately                                                                       |
| Recipe-level built-in evidence and assessment         | Recipe ingredients, curated rules/food facts, schema-constrained author/co-creator corrections, optional on-device structured result | Explain recipe compatibility with a built-in standard and support recipe reuse              | May imply health relevance but is recipe metadata, not a profile verdict                          | Neon; local analysis cache when enabled; Vercel request path; backups                                            | Subject to recipe authorization. A dedicated allowlisted public projection exposes only permitted current built-in facts                                                                     | Current fact follows the recipe lifetime; invalidated/superseded versions purge on the schedule below; actor attribution is personal data                            |
| Personalized profile assessment                       | Derived from one profile/custom restriction and one authorized recipe                                                                | Present a private, profile-specific verdict                                                 | Health-adjacent derived data                                                                      | Neon; account-bound browser cache when enabled; backups                                                          | Creator only in v1. Never public, shared, or inferred from `groupId`                                                                                                                         | Until the underlying profile, restriction, recipe access, or account purpose ends; stale copies purge within 30 days                                                 |
| Ingredient or assessment correction                   | Creator or authorized recipe editor                                                                                                  | Correct evidence and recalculate a result                                                   | Schema-constrained values may still reveal a dietary concern through their rule/food association  | Neon and backups; Vercel request path                                                                            | Recipe corrections follow recipe authorization; profile/custom corrections remain creator-only                                                                                               | Only a schema-constrained allowlisted recipe fact with no personal text/context may survive de-attributed; private custom-restriction corrections cascade on erasure |
| Rejected assessment submission                        | Client submission rejected for authorization, deterministic conflict, stale fingerprint, invalid version, or invalid payload         | Protect assessment integrity and diagnose bounded failures                                  | The submitted payload could contain recipe or dietary content                                     | The rejected payload must not be persisted or logged. A fixed reason code may enter a bounded operational record | Operations may see fixed codes/counts only                                                                                                                                                   | Payload: no retention. Fixed status/reason: no more than 30 days                                                                                                     |
| Smart-analysis enablement state                       | Account holder action plus notice version and timestamps                                                                             | Remember whether optional local analysis may run and evidence what product notice was shown | Preference and product-state metadata; not itself proof of a legal basis                          | Neon if #1100 persists it; local setting; backups                                                                | Account holder and authorized operations only                                                                                                                                                | Latest state for account lifetime; delete on account erasure. Do not retain an unbounded toggle history                                                              |
| Model asset and runtime state                         | Static model bytes, integrity metadata, worker state, capability tier                                                                | Run optional interpretation locally                                                         | Model bytes are not personal data; request metadata and account-bound analysis state can be       | Selected model distributor or Vercel for asset delivery; browser Cache Storage/IndexedDB/memory                  | Distributor receives request metadata only. No recipe or dietary content                                                                                                                     | Purge account-bound artifacts on disable, sign-out, account switch, and deletion completion; maximum 30-day cache age                                                |
| Dietary operational analytics                         | Coarse enablement, model download outcome, capability tier, analysis outcome, trigger, and fixed error codes from #1107              | Measure adoption and runtime reliability                                                    | Pseudonymous account analytics; health content is forbidden                                       | PostHog after analytics consent/GPC/DNT checks                                                                   | Product analytics operators; never include recipe/profile/restriction/rule/ingredient identifiers or content, `groupId`, household/group identifiers, or subject/manager relationship fields | Proposed 90-day raw-event limit; longer trends only after documented anonymous aggregation                                                                           |
| Operational logs                                      | Fixed error code, count, timestamp, route/runtime metadata                                                                           | Reliability, abuse detection, and incident response                                         | Request metadata can be personal data                                                             | Vercel and approved application logging                                                                          | Least-privilege operations access                                                                                                                                                            | No dietary payload or identifiers; maximum 30 days                                                                                                                   |
| Deletion evidence                                     | Salted subject hashes, aggregate counts, notice version, and backup horizon when configured                                          | Evidence erasure and re-apply it after restore                                              | Pseudonymous deletion record deliberately minimized                                               | Neon and backups                                                                                                 | Restricted operations access                                                                                                                                                                 | Retained under the existing account-erasure contract; never add dietary text, ids, names, verdicts, or fingerprints                                                  |
| Database backups                                      | Copies of the above Neon-hosted rows                                                                                                 | Disaster recovery                                                                           | Same sensitivity as the live rows                                                                 | Neon in the configured production region/history window                                                          | Restricted restore operators                                                                                                                                                                 | Beyond use after live deletion; expires with the actual provider window; re-erased before a restored instance serves traffic                                         |

## Processing purposes and proposed legal questions

| Purpose                                                        | Necessary data                                                                | Data minimization                                                                                  | Legal question requiring human sign-off                                                                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core creator-requested dietary profiles and exact restrictions | Profile name, selected built-in rules, custom terms, severity                 | No diagnosis, date of birth, guardian identity, or subject account; creator can delete the profile | Confirm Article 6 basis and whether an Article 9 condition is required for health, religious, or inferred sensitive data                                   |
| Deterministic recipe evidence and built-in facts               | Recipe ingredients, curated rules, structured evidence and freshness metadata | No profile linkage is needed for recipe-level facts; no generated prose or model trace             | Confirm the basis for retaining and publicly projecting allowlisted recipe facts                                                                           |
| Optional on-device interpretation                              | Ingredient input on the device, static model, structured output               | No cloud inference; sync structured evidence only; server revalidates untrusted output             | Confirm whether separate explicit consent or another Article 9 condition is required and what withdrawal must do                                           |
| Private personalized assessment                                | Profile/restriction plus an authorized recipe                                 | Store only while needed; prefer recomputation; never expose through public/shared projections      | Confirm profiling and transparency obligations. Fail closed for child/non-user model-assisted or custom processing until an approved rights process exists |
| Coarse dietary operations analytics                            | Bounded enums and booleans only                                               | Separate analytics consent; no content, identifiers, verdicts, severity, evidence, or raw errors   | Confirm the 90-day raw retention target, consent wording, transfer mechanism, and whether anonymous aggregates are sufficiently de-identified              |
| Reliability and security                                       | Fixed failure codes/counts                                                    | No dietary payloads or identifiers; 30-day maximum                                                 | Confirm whether any incident/legal hold exception is needed and how it is authorized and recorded                                                          |

## DPIA screening

A proportionate DPIA is required before production enablement because the design combines
health-adjacent or potentially special-category data, data about possible non-users and children,
personalized evaluation, optional model processing, public recipe projections, and shared-device
offline storage. The feature is dormant until the production gates below are satisfied.

### Necessity and proportionality

- The cooking-safety purpose can be met without collecting diagnoses, birth dates, guardian
  identity, contact details for the profiled person, or cloud model prompts.
- Deterministic checks remain available without the optional model.
- Custom restrictions are entered and approved by the creator; the model must not infer whether a
  restriction is medical.
- Recipe-level facts and profile-personal verdicts use separate structures and authorization.
- A correction targets evidence, not an opaque final conclusion.
- Analytics measures operational reliability through bounded enums rather than dietary content.
- Export, correction, profile deletion, account erasure, and consent withdrawal remain available
  regardless of plan.

### Risk and control assessment

| Risk                                                                      | Potential impact                                                          | Required control                                                                                                                                                                                                          | Residual decision/owner                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| A profile is exposed because `groupId` is treated as sharing              | Disclosure of health or belief information to household members           | Check profile ownership independently on every read/write/export; no group-derived authorization; isolation tests                                                                                                         | Product confirms v1 private-only scope; engineering verifies        |
| Personalized data enters a public/shared recipe projection                | Persistent health inference attached to a recipe or person                | Dedicated allowlisted projection containing built-in recipe facts only; structural prohibition on profile/custom linkage                                                                                                  | Implemented in #1101; reverify in the release gate                  |
| A false positive or false negative is presented as safety advice          | Allergen exposure, exclusion of usable food, or misplaced confidence      | Deterministic conflicts veto model output; unresolved inputs fail closed; provenance/freshness shown; no certification inference; correction path                                                                         | Product, safety, and qualified legal review of claims               |
| A shared device reuses another account's cached result                    | Cross-account disclosure of profiles or dietary needs                     | #1109 account-bound coordinator; stop workers/jobs and purge named caches/IndexedDB on identity transition; maximum cache age                                                                                             | Coordinator landed in #1109; dietary registration verified by #1106 |
| Disable, sign-out, downgrade, or deletion leaves local artifacts          | Continued processing or recoverable personal data after withdrawal        | One cleanup registration boundary; cancellation before purge; idempotent best-effort storage cleanup; explicit downgrade behavior                                                                                         | Product decides model-binary retention on downgrade                 |
| Analytics or logs receive dietary content                                 | Secondary use, unexpected disclosure, or processor transfer               | #1107 exact whole-event allowlist on client/server/`before_send`; unknown `dietary_*` rejection; canary tests; fixed log codes only                                                                                       | Engineering verifies after #1107; privacy owner reviews retention   |
| Model distribution creates an undocumented recipient or transfer          | Undisclosed request metadata, retention, subprocessors, or licensing risk | Name the host/distributor, region, DPA/controller status, subprocessors, transfer, logs, retention, integrity, and license before enablement                                                                              | Legal / operations / security                                       |
| Data about a child or non-user is entered without an account              | The subject cannot directly exercise rights or understand processing      | Fail closed: prohibit model-assisted/custom-restriction processing for that subject until an approved process defines intake, verification, conflicting claims, response ownership, and non-disclosing correction/removal | Qualified legal/product decision before enablement                  |
| Account deletion retains personal correction content with a shared recipe | Under-erasure and ongoing sensitive disclosure                            | Retain only schema-constrained allowlisted built-in facts without personal text/context; delete private, free-text, or identifying correction content; remove actor linkage; projection and erasure tests                 | Implemented in #1101; reverify in the release gate                  |
| Backup restore resurrects erased dietary data                             | Reappearance of deleted profiles/restrictions                             | Existing salted tombstone and mandatory re-erasure restore gate; no production promotion before zero resurrected subjects                                                                                                 | Operations; #855/#806 must pin and record horizon                   |
| Long-lived stale or superseded facts reveal old restrictions              | Unnecessary sensitive history and incorrect results                       | Invalidate immediately; purge stale/superseded personal data within 30 days; current-only readers                                                                                                                         | Product/privacy approve period; engineering automates if persisted  |

## Processor and transfer review

The factual recipient list is maintained in [processor-register.md](./processor-register.md).
Before production enablement, the review must confirm:

1. Neon, Vercel, and PostHog regions actually configured in production.
2. DPA/controller status, subprocessors, international transfer mechanism, and provider retention.
3. PostHog raw dietary event retention is configured to the approved bound.
4. The model asset host/distributor is named and reviewed. If it is Vercel, record that decision;
   do not assume self-hosting merely because the app already uses Vercel.
5. Model asset integrity/signature or digest verification and distribution licensing are approved.
6. No model or application call sends ingredient, recipe, profile, or restriction content to a
   third-party inference service.

## Rights and transparency review

The implementation must satisfy
[dietary-retention-and-rights.md](./dietary-retention-and-rights.md). Legal and product reviewers
must approve source copy before translation for:

- private creator-controlled profiles and the fact that `groupId` does not share one;
- why data is used and whether it may concern a child or non-user;
- deterministic versus optional on-device processing and the absence of cloud inference;
- enable, disable, model download/storage, unsupported-device, and downgrade behavior;
- access/export, correction, profile deletion, account erasure, and retained recipe facts;
- backup-beyond-use behavior using the actual configured horizon;
- limitations around brands, cross-contact, preparation, certification, and medical reliance.

Translation review is required for English, Spanish, German, and Arabic. Engineering text must not
be presented as qualified legal approval in any locale.

### Child and non-user subject rights

Creator control is not a substitute for a subject-rights process. Until qualified legal and product
owners approve and operations can run all of the following, model-assisted/custom-restriction
processing is self-only. Before either capability runs, require a minimal, non-identifying
subject-scope declaration that the profile describes the creator. Missing, non-self, or disputed
status must reject the server-side operation and persistence; it must not be treated as consent,
silently defaulted to self, or bypassed by a client-only check. Tests must prove each blocked state.

- a request intake path that does not require the subject to access the creator's account;
- identity and authority verification appropriate to the request without collecting unnecessary
  identity data;
- a rule for guardian, subject, and creator claims that conflict;
- a named response owner and applicable response-time tracking;
- access, correction, restriction, objection, and removal handling that does not disclose the
  creator's account, household, or other profile data;
- an auditable escalation route for safety and abuse concerns.

The declaration is a processing-scope gate, not verified identity, age, guardianship, or consent.
It must not collect a subject name or relationship. Non-self processing remains prohibited until
the approved rights process above is implemented. Any alternative requires an updated DPIA and
notice.

### CCPA/CPRA applicability gate

Qualified counsel must determine whether CCPA/CPRA applies and whether dietary profile data is
sensitive personal information under the deployed product and business model. If applicable,
production enablement requires reviewed behavior and notices for:

- notice at collection, categories, purposes, recipients, and category-specific retention;
- rights to know/access, delete, and correct;
- any right to limit use/disclosure of sensitive personal information;
- sale, sharing, cross-context behavioral advertising, and the applicable opt-out signal/path;
- authorized-agent requests and identity/authority verification;
- non-discrimination for exercising privacy rights.

The current design intends no sale, sharing, or targeted-ad use of dietary data, but that is a
product/processor fact to verify, not a legal conclusion.

## Production-enable human gates

The feature flag for model-assisted dietary analysis must remain off until all items have a named
human approver and recorded outcome:

- lawful basis and any special-category processing condition;
- notice at collection and rights wording;
- children/non-user subject handling;
- CCPA/CPRA applicability and, if applicable, the complete notice/rights/opt-out/limit/non-discrimination
  implementation;
- processor contracts, regions, transfers, subprocessors, and retention;
- selected model asset distributor/host and distribution controls;
- approved retention periods and automated enforcement;
- actual Neon backup horizon plus restore/erasure evidence;
- implementation evidence from #1101, #1107, and #1109;
- localized legal/privacy copy review.

An unresolved gate is a production blocker. This document records the blocker; it does not satisfy
or waive it.
