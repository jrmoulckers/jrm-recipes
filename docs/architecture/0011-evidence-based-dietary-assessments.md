# ADR-0011: Evidence-Based Dietary Assessments

- **Status:** Accepted
- **Date:** 2026-09-06
- **Issue:** [#1092](https://github.com/jrmoulckers/jrm-recipes/issues/1092)

## Context

Heirloom currently has three related but different forms of dietary metadata:

- `recipes.dietary_flags` stores explicit author declarations.
- `recipes.dietary_tags` stores `dairy-free`, `gluten-free`, and `egg-free` values derived from
  ingredient text.
- The allergen and substitution libraries independently detect conflicts and label possible swaps.

[ADR-0001](./0001-recipe-classifications.md) correctly keeps these trusted sources separate from
free-form tags, but the trusted sources are still binary. They cannot explain which ingredients
support a result, distinguish an unresolved ingredient from a safe one, represent personalized
avoidance rules, or show how a substitution would change a recipe.

The current derivation also reasons from an absence of recognized allergens. If the detector does
not recognize "seasoning blend", that absence is not evidence that the blend is gluten-free. A
binary tag hides this distinction and can become more authoritative as it moves into search,
planning, public recipe pages, and "safe for" experiences.

Model-assisted interpretation can resolve more ingredient language, but model output must not
become a second prose interface or an unquestioned source of truth. Dietary results belong in the
existing recipe experience as badges, warnings, filters, and substitution outcomes. Basic safety
information must also remain useful without a paid plan.

This decision follows the trust-centered packaging obligation in `PROD-BUS-001`: Family may charge
for automation and advanced interpretation, but not for access to basic warnings, accessibility,
or a person's own dietary data.

## Decision

Replace binary derived claims with an evidence-based assessment model. Ingredient evidence and
conflicts are canonical; user-facing dietary labels are projections of that evidence for a
particular standard and, where applicable, a particular dietary profile.

The model has four layers:

1. **Rule:** the dietary standard or custom restriction being evaluated.
2. **Evidence:** what each ingredient establishes, might establish, or leaves unresolved.
3. **Assessment:** the recipe-level verdict, confidence band, provenance, and freshness.
4. **Presentation:** the compact badge, warning, filter result, or substitution impact appropriate
   to the current context.

Free and Family use the same assessment contract. Family can produce more evidence through an
optional on-device interpreter, but it cannot weaken deterministic findings or replace explicit
provenance.

## Assessment vocabulary

An assessment uses a small, structured vocabulary rather than generated conclusions:

```ts
type DietaryVerdict = 'meets' | 'conflicts' | 'unknown';
type DietaryConfidence = 'high' | 'medium' | 'needs-review';
type DietaryEvidenceFinding = 'present' | 'absent' | 'possible' | 'unresolved';
type DietaryEvidenceSource =
  | 'food-link'
  | 'text-match'
  | 'on-device'
  | 'author-confirmed'
  | 'ingredient-correction'
  | 'certification';
```

The eventual persisted assessment must also carry:

- the recipe and dietary rule identifiers;
- ingredient-level evidence references;
- the ingredient fingerprint it evaluated, including the item text and any amount, unit, preparation,
  or linked-food input that influenced resolution;
- the analyzer version and a ruleset version composed from an algorithm version plus an automatic
  content hash of the curated rules and food-allergen data;
- provenance;
- creation and invalidation timestamps.

The persisted output contains structured facts, not prompts, chain-of-thought, model traces, or
generated paragraphs.

### Aggregation invariants

Dietary compatibility is an all-ingredients constraint, not a weighted average.

1. A deterministic conflict wins over model output and author confirmation.
2. A credible possible conflict cannot be averaged away by many recognized ingredients.
3. Ingredient amount may improve identification context, but never dilutes a conflict. A garnish
   can still violate a restriction.
4. `high` requires complete relevant ingredient coverage and no conflicting evidence.
5. `medium` means no conflict was found but limited ambiguity remains; it is a possible match, not a
   safety guarantee.
6. `needs-review` means material evidence is unresolved or contradictory.
7. An author may resolve uncertainty by confirming ingredient suitability, but may not override a
   detected conflict. The conflicting ingredient must be corrected or changed.
8. Missing ingredients, an empty ingredient list, or stale evidence never produce `high`.

Confidence bands are intentionally categorical. A percentage would imply calibrated statistical
precision that the initial deterministic and on-device systems do not possess. Evidence coverage
such as "8 of 9 ingredients recognized" may be shown as supporting context without converting it
into a probability.

An ingredient is covered for a rule only when it resolves to a food-graph node whose facts cover
that rule, an applicable positive text rule matches, or reviewed evidence explicitly resolves it.
A text line with no match is `unresolved`; it is never evidence of absence.

Only these verdict and confidence combinations are valid:

| Verdict     | Confidence     | Meaning                                                                |
| ----------- | -------------- | ---------------------------------------------------------------------- |
| `meets`     | `high`         | Complete relevant coverage, with no possible or definite conflict.     |
| `meets`     | `medium`       | No conflict found, but limited non-material ambiguity remains.         |
| `unknown`   | `needs-review` | At least one material input is possible, unresolved, or contradictory. |
| `conflicts` | `high`         | At least one definite conflict exists.                                 |

Author confirmation is provenance, not algorithmic confidence. A conflict-free author confirmation
satisfies a dietary filter and displays as confirmed without inventing a confidence band. If a
conflict exists, the recipe remains `conflicts/high` and the contradictory confirmation is retained
only as evidence to resolve.

## Rules and restrictions

### Built-in standards

The first complete rule registry includes:

- the current major-allergen groups: peanut, tree nut, dairy, egg, soy, wheat/gluten, fish,
  shellfish, and sesame;
- ingredient-composition standards such as vegan, vegetarian, and pescatarian;
- confirmation-only standards whose truth depends on sourcing, certification, cross-contact, or
  preparation practices.

The system must not infer certification or process claims. For example, ingredient analysis can
evaluate whether recognized ingredients contain wheat, but cannot claim celiac-safe preparation or
certified kosher or halal status. Those require explicit evidence from the author or an appropriate
certification source.

Rule ids live in a registry independent of the existing `DietaryTag` TypeScript union. That union
remains a compatibility and presentation projection while callers migrate. Existing deterministic
vegan and vegetarian conflict warnings remain available on Free; Family adds positive
composition-based assessments where complete evidence supports them.

### Custom restrictions

A dietary profile may define a named avoid rule such as "No mushrooms." The profile owner chooses
one of three effects:

| Severity            | Product behavior                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Allergy/intolerance | Definite, possible, and unresolved matches fail closed and are excluded from safe results. |
| Strict avoidance    | Matching recipes are excluded; unresolved matches are visibly disclosed.                   |
| Preference          | Matching recipes remain available but rank lower and use quieter presentation.             |

Exact user-entered ingredients are available on Free. Family may suggest ingredient families,
synonyms, and aliases, but the user must approve them before they affect results. The model never
infers whether a custom restriction is medical.

Custom restrictions attach to an individual dietary profile and can be copied deliberately to
another profile. Authorization and collaboration follow Heirloom's existing recipe, profile,
family, and co-creator rules; this feature does not create a parallel permission system.

## Provenance and correction

Author-confirmed and inferred assessments remain distinguishable even when they produce the same
visible label.

- Authors and authorized co-creators correct ingredient evidence, not the final verdict.
- A correction such as "this named soy sauce is gluten-free" applies to that recipe ingredient and
  triggers recalculation.
- Other concerns use the product's existing collaboration and feedback patterns rather than
  directly rewriting shared evidence.
- An author confirmation can promote an otherwise unresolved rule to a confirmed result, provided
  no conflict remains.
- Every public or personalized result retains its source and freshness even when the compact UI
  does not print those fields inline.

Corrections are recipe-specific by default. Promoting one correction into the shared food graph
requires the graph's own curation process; a local correction must not silently retrain global
behavior.

Free-form tags remain outside the trust boundary established by
[ADR-0001](./0001-recipe-classifications.md). A tag named "gluten-free", including one categorized
as `dietary`, is neither evidence nor a declaration and cannot satisfy a dietary filter.

## Free and Family boundary

Free remains a complete core cooking product:

- author-declared dietary labels;
- deterministic recognition of known allergens and conflicts;
- unresolved-ingredient cautions;
- exact custom restrictions and their severities;
- access to all existing assessments and corrections;
- accessible evidence disclosure.

Family adds convenience and interpretation:

- optional on-device interpretation of ambiguous or compound ingredients;
- inferred dietary badges beyond complete deterministic matches;
- approved alias suggestions for custom restrictions;
- composition-based vegan, vegetarian, pescatarian, and similar analysis;
- personalized automatic refresh;
- dietary impact previews for substitutions;
- progressive library analysis and an explicit bulk-analysis action.

This capability receives its own entitlement rather than borrowing `aiSubstitutions`. The
entitlement describes the purchased outcome, such as `advancedDietaryAnalysis`, without coupling
the plan contract to a particular model runtime.

Entitlements must be enforced in the service layer as well as the UI. Downgrade stops new
model-assisted analyses and refreshes but does not hide assessments, evidence, corrections, or
custom restrictions that already exist.

On-device analysis does not consume `aiCreditsPerMonth`, including a user-started library scan.
`src/config/plans.ts` and `docs/pricing-and-packaging.md` gain the entitlement only when the
corresponding implementation ships; until then, they continue to describe current behavior.

## On-device analysis lifecycle

Family users explicitly enable smart dietary analysis and approve the model download. Setup
discloses the download and storage cost. Recipe ingredient text is not sent to a cloud fallback.

After enablement:

1. Deterministic checks continue to run immediately while editing.
2. Model-assisted analysis runs after save, when the ingredient list is stable.
3. Opened and newly saved recipes are analyzed progressively.
4. A separate user-started action can analyze the existing library.
5. Unsupported devices fall back to deterministic results without implying failure or reduced
   safety.

Only the structured assessment syncs. Once synced, family members and other authorized viewers can
reuse it without independently downloading or running the model. A newer valid assessment replaces
an older one deterministically.

Synced model output is untrusted input. The server re-evaluates deterministic evidence and rejects
any submitted assessment that contradicts it. The server also applies the existing recipe and
profile authorization rules. A viewer-produced assessment remains personal unless the actor has
the same authority required to update the recipe or an authorized server workflow promotes it;
personal assessments never feed public badges.

Assessments are stored per recipe, rule, and source so model output cannot overwrite deterministic
or confirmed evidence. Readers apply source precedence, beginning with deterministic conflicts.
The server accepts a completed analysis only when its ingredient fingerprint still matches the
recipe and it is not older than the accepted ruleset/analyzer tuple. Client clocks never determine
which result wins.

The assessment's ingredient fingerprint and ruleset version are freshness boundaries. Editing any
ingredient input used by resolution invalidates the inference immediately. A ruleset-version
mismatch is always a cache miss because changed curated knowledge can invalidate an old safety
claim. An ordinary on-device model-version update may mark a refresh as available without erasing a
result produced under the current ruleset. A stale assessment cannot satisfy a positive dietary
filter or appear as a public inferred badge.

Custom restrictions, corrections, and persisted assessments participate in the existing account
export, account erasure, and shared-recipe retention behavior. On-device model and analysis caches
are removed when smart analysis is disabled or the user signs out. Downgrade may retain the local
model for offline display and a future resubscription, but it cannot run new premium analysis.

### Privacy, retention, and rights boundary

Issue #1106 owns the detailed implementation contract in
[`docs/privacy/dietary-data-inventory-and-dpia.md`](../privacy/dietary-data-inventory-and-dpia.md)
and
[`docs/privacy/dietary-retention-and-rights.md`](../privacy/dietary-retention-and-rights.md).
Those documents make explicit several boundaries that this architecture depends on:

- profiles and custom restrictions are private, creator-controlled notes in v1;
- a profile's optional `groupId` organizes the creator's data but never grants another person
  access;
- only current recipe-level built-in-rule facts may enter a shared/public projection or follow a
  recipe retained under ADR-0009;
- profile names, custom restrictions, severities, personalized assessments, and profile/private
  corrections must cascade with their profile and never survive as recipe facts;
- authenticated export includes requester-owned or requester-attributed dietary data without
  exposing another person's profile;
- account erasure removes actor/profile linkage from any retained built-in recipe fact and records
  aggregate counts only;
- one account-bound cleanup coordinator must stop work and purge model, analysis, IndexedDB, and
  personalized recipe caches on disable, sign-out, account switch, and deletion completion;
- smart-analysis enablement is separate from analytics consent and from any legal consent record.

These are release requirements, not claims about the current schema. They must be verified against
#1101, #1107 and #1109 after those implementations land. Production enablement also remains blocked
on qualified legal review, a named model asset host/distributor, and an honest configured backup
horizon; engineering documentation does not satisfy those human gates.

## Integrated presentation

Dietary intelligence is not a standalone AI surface. It uses the existing badge, recipe,
ingredient, search, and substitution interaction patterns.

### Badges

The primary label stays short, for example:

- `Gluten-free`
- `Contains gluten`
- `Gluten needs review`

Color communicates suitability, conflict, or review state. It does not communicate whether AI was
used. A small provenance icon distinguishes author-confirmed from ingredient-analyzed results.

The badge is a keyboard-focusable control that opens a compact accessible popover. Hover may open
the same popover for pointer users, but no information is hover-only. The popover contains:

- confidence or confirmation source;
- recognized ingredient count;
- only the ingredients that conflict or need attention;
- a concise limitation covering brands and cross-contact where relevant;
- one direct correction or review action when the viewer is authorized.

It does not contain generated prose, model reasoning, chat UI, or a percentage.

For a signed-in viewer, badges relevant to the active dietary profile appear first, followed by
author-confirmed badges. Public recipe pages show author-confirmed badges plus at most three
`high` inferred badges, then a compact `+N dietary details` control. Public structured metadata
uses author-confirmed claims only so machine consumers never detach an inferred label from its
evidence disclosure.

Free surfaces do not show locked inferred-badge placeholders. When deterministic analysis leaves a
material ingredient unresolved, its popover may include a quiet contextual action to enable Family
analysis. Upgrade prompts do not appear on every card or as persistent safety warnings.

### Search and filtering

- Author-confirmed and `high` conflict-free assessments satisfy a dietary filter.
- `medium` assessments appear in a separate **Possible matches** section.
- `needs-review`, stale, and conflicting assessments do not satisfy a positive dietary filter.
- Allergy/intolerance profiles fail closed on both definite and possible conflicts.
- Preference rules influence ranking rather than exclusion.

Search must preserve provenance so a card can explain why it appears. It must not flatten possible
matches into the main result set.

### Substitutions

A substitution preview shows its likely dietary effect in the option row, for example:

- `Removes gluten`
- `Adds a nut conflict`
- `Still needs review`

Browsing swaps does not mutate the recipe assessment. The complete recipe is recalculated only
after the shared ingredient edit is persisted. A per-cook hypothetical or private variation may
recalculate a personal preview but never writes the shared or public assessment. Ingredient-match
confidence and dietary-impact confidence remain separate: confidently recognizing "plain flour"
does not itself prove that a proposed replacement meets every dietary rule.

## Compatibility and migration

`recipes.dietary_flags` remains the compatibility projection for author declarations.
`recipes.dietary_tags` remains temporarily readable while assessment-backed readers are introduced.
It must not be treated as evidence-complete during migration.

Delivery should proceed in independently reviewable phases:

1. Introduce the rule, evidence, assessment, correction, custom-restriction, and version contracts.
2. Replace binary derivation with deterministic evidence and compatibility projections.
3. Add integrated badges, popovers, profile relevance, and correction flows.
4. Move search and "safe for" filtering onto assessment semantics.
5. Add the Family entitlement and optional on-device runtime.
6. Add substitution impact and progressive/bulk analysis.
7. Backfill eligible recipes, compare old and new results, then retire `dietary_tags` only after no
   trusted reader depends on it.

Each phase must preserve fail-closed behavior for medical restrictions and must be independently
reversible. Model download, analysis completion, correction, and upgrade events may be measured,
but analytics must not include ingredient text, restriction names, evidence payloads, or other
sensitive dietary data.

The server write path, stale-read rules, and public-projection tests are release gates for every
phase that persists model-assisted evidence. Client entitlement checks or UI hiding alone never
authorize an assessment write.

## Alternatives rejected

### Keep declared and derived string arrays

Rejected because arrays cannot represent ingredient evidence, uncertainty, staleness, corrections,
or analyzer provenance. Adding more strings would make the trusted-source boundary harder to audit.

### Let the model assign final tags directly

Rejected because an opaque classification can erase deterministic conflicts, drift between model
versions, and produce no actionable correction path.

### Average ingredient confidence

Rejected because dietary rules are veto-based. Nine recognized ingredients cannot compensate for
one ingredient that contains the restricted substance.

### Put all dietary interpretation behind Family

Rejected because known conflicts, user-entered restrictions, accessible disclosure, and existing
data access are safety and trust features. Family charges for automation and interpretation.

### Show an AI analysis panel

Rejected because dietary results are supporting metadata within cooking tasks. A prose-heavy or
chat-shaped surface increases cognitive load, exposes implementation rather than value, and makes
critical evidence harder to scan.

### Use a cloud fallback

Rejected for the initial design. The optional local model gives the premium feature an offline,
privacy-preserving boundary. Devices that cannot run it retain deterministic behavior rather than
transmitting recipe and dietary context elsewhere.

## Consequences

- Dietary claims become explainable, correctable, versioned, and reusable across search,
  substitutions, planning, and public recipes.
- Free becomes more conservative than today's absence-based binary derivation when ingredient
  coverage is incomplete.
- Family gains a meaningful premium workflow without withholding known safety information.
- On-device distribution introduces model-size, browser-capability, storage, and battery constraints
  that require explicit setup and progressive processing.
- Public inferred badges require ongoing compatibility and revocation support because a synced
  result can outlive the device and model that produced it.
- Health-adjacent data, non-user/child profiles, rights behavior, processor transfers, and
  purpose-bound retention require the DPIA and production gates recorded in
  `docs/privacy/dietary-data-inventory-and-dpia.md`.
- The implementation is larger than adding a confidence column, but it avoids propagating another
  binary representation that would need to be replaced when personalized restrictions arrive.
