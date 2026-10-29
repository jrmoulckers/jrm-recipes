# ADR-0012: Opt-in, diff-verified reported-bug fast lane

- **Status:** Accepted
- **Issue:** [#1166](https://github.com/jrmoulckers/jrm-recipes/issues/1166)

## Context

The existing bug-bash prompt discovers campaigns of bugs. It does not provide a
single-report delivery contract. Full unit execution can consume most of a
fifteen-minute report-to-live budget before downstream checks start.

## Decision

Use the [reported-bug loop](../bug-loop.md) for intake through production
verification. Introduce a narrowly opt-in fast lane with one shared classifier
for local and CI test selection. Verify the complete diff, not labels or the PR
body alone. Initially permit only bounded static-class edits in known
presentation primitives with changed unit and browser regressions.

Keep the aggregate gate and every CI job. Reduce only unit/E2E scope for an
eligible PR; keep build, bundle budgets, audit, migrations and performance
unchanged. All main/staging pushes retain full suites. Infrastructure and the
classifier's own changes always take the full path.

No automatic publication or new privileged automation is introduced. Existing
deployment and human gates remain authoritative. Declare a fix live only after
the exact production SHA is healthy and the reported symptom is rechecked.

## Consequences

Many bugs deliberately remain full-lane. A request to widen scope needs a
separate reviewed policy change and evidence from completed delivery timings.
Fifteen minutes is an SLO, not a guarantee and never a reason to bypass red CI.
Static-class equivalence limits code risk; it does not prove accessibility or
visual correctness, which still require the defect-specific browser assertion.

Enabling the loop also required remediating expired audit exceptions rather than
renewing them: patched Next.js and transitive tooling, Cloudinary's supported v7
widget API (the existing consumers already use `onSuccess`), and a direct Vite
development dependency to resolve the test runner's patched peer. The obsolete
Lighthouse CI CLI is replaced by a repository-owned runner using current
Lighthouse and installed Chrome, retaining the existing routes, samples, budget
severity, aggregation, and private report boundary. No audit suppression remains.
