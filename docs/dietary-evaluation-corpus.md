# Dietary ingredient-resolution evaluation corpus

The versioned corpus in
[`src/lib/dietary-evaluation-corpus.v1.ts`](../src/lib/dietary-evaluation-corpus.v1.ts)
tests ingredient resolution against the safety invariants in
[ADR-0011](./architecture/0011-evidence-based-dietary-assessments.md). It is synthetic and curated:
it contains no recipes, dietary profiles, or ingredient text collected from users.

## Contract

Each case contains one ingredient string, one supported locale, one scenario category, and one
canonical allergen rule id. A resolved expected outcome is either `present` or `absent` and records
its evidence source. Finding, source, and rule-id types come from the production assessment core
introduced in #1101:

- `food-link` names the canonical food node whose reviewed facts support the finding;
- `text-match` supports a positive finding when the text is explicit but the current food graph has
  no sufficiently specific node;
- `certification` names the canonical food while keeping the label claim distinct from food facts.

Text matching cannot establish absence. `possible` and `unresolved` deliberately carry no
explanation or model output. A future resolver may report `on-device` provenance; it is accepted
when its finding matches and, where the reviewed expectation defines canonical food identities,
those identities match exactly.

The model-agnostic harness in
[`src/lib/dietary-evaluation.ts`](../src/lib/dietary-evaluation.ts) accepts a synchronous or
asynchronous resolver function. The resolver receives only the production-shaped `locale`, `input`,
and `ruleId`; case ids, categories, and expected outcomes remain private to the evaluator. It
reports:

- `accepted` when the finding and required canonical food identity match;
- `false-safe` when a resolver claims absence without the expected evidence, or claims absence for
  a present, possible, or unresolved case;
- `false-conflict` when a known negative is reported as present or possible;
- `unresolved` when the resolver abstains or cannot support an otherwise resolved finding.

Coverage is reported separately as resolved, possible, and unresolved case counts, including
per-locale and per-category breakdowns. Resolver errors and malformed results fail closed as
`unresolved`, remain visible in the report, and fail the release gate. Well-formed explicit
`unresolved` abstentions are allowed. High coverage does not offset unsafe results.
`assertDietaryEvaluationReleaseGate` fails on any false-safe case or evaluation error and does not
convert coverage into a confidence score.

The exported `resolveWithDeterministicAllergens` adapter measures the existing static matcher
without importing an on-device model. Because the current matcher records positive rules rather
than complete negative facts, a missing match remains `unresolved`; it never becomes an inferred
safe result.

## Coverage and review

Version 1 contains 56 cases across English, Spanish, German, and Arabic. Every locale includes
resolved positives, known negatives, possible products, unresolved products, prompt-like input, and
a non-absent case for every supported allergen rule. The full corpus covers direct allergens,
hidden or compound products, safe negatives, negation and certification wording, OCR errors,
fictional brands, ambiguous products, compound lines, overlong lines, and adversarial instructions.
Adversarial cases include both real conflicts hidden behind instructions to answer "safe" and safe
ingredients paired with instructions to invent a conflict.

Corpus changes require review of:

1. The dietary finding, evidence source, and canonical food/rule identifiers.
2. Whether every linked food node has reviewed facts covering the evaluated rule. Food-link
   absence cases are intentionally unresolved in the current positive-only deterministic adapter.
3. Native-language meaning, including negation and misspelling intent.
4. Whether a brand example is fictional and the text contains no user data.
5. Whether an uncertain product remains `possible` or `unresolved` rather than becoming a safe
   negative.
6. The release-gate result for the deterministic adapter and any model adapter being released.

## Versioning and regressions

`schemaVersion` changes only when the case or resolver contract changes. `corpusVersion` follows
semantic versioning:

- patch: correct wording or metadata without changing the expected safety meaning;
- minor: add cases or categories;
- major: change an existing expected outcome or remove a case.

Add a regression as a minimal synthetic case with a stable locale-prefixed id. Prefer a canonical
food node already in the food graph. If no canonical node exists, use `possible` or `unresolved`
and create the food-graph work separately rather than inventing a corpus-only identifier. Never
paste real user input, generated explanations, prompts, model traces, or sensitive dietary data
into the corpus.
