# Reported-bug delivery loop

Report a bug in this repository's Copilot conversation:

```text
Bug: On /recipes, [steps], I see [actual] instead of [expected].
Preferred fix: [optional suggestion].
```

That is enough to start. A URL, screenshot, viewport, or affected mode helps but is
not mandatory. Do not include private recipe data, credentials, or session tokens.
The agent asks one focused question only when it cannot reproduce or safely infer
the expected behavior. A requested fix is a hypothesis, not a substitute for diagnosis.

## Agent execution contract

1. Record receipt time from a clock and the reported reproduction. Find or create
   the issue before changing files; reuse an existing issue session rather than
   dispatching duplicate work. Use one isolated feature branch per fix.
2. Reproduce the original symptom. Add the smallest regression assertion, run it
   against the unfixed implementation, and confirm the intended failure by name.
   If reproduction fails, report that rather than guessing a patch.
3. Make the scoped fix. Check adjacent behavior, keyboard operation and affected
   viewport/mode. Classify the actual diff with the command below. Escalate
   uncertain or sensitive work to the full lane; never race a red gate.
4. Run the selected local gate, push, open the linked PR, and watch **Quality gate**
   and mergeability. In an activated bug-bash batch, target its integration
   branch and stop at **validated / PR ready**; do not merge each fix to `main`.
   Otherwise self-merge only a PR opened in this session after every required
   check passes. Do not modify settings, secrets, or deployment gates.
5. After an approved release, its owner observes the Vercel deployment and
   [deployment watcher](../.github/workflows/deploy-watch.yml). Require production
   `/api/health` to report the deployed commit SHA, `status=ok`, and `db=ok`.
   Each bug still needs its original user-visible reproduction on that deployment.
   Preserve the first attempt without retries, with its issue, SHA, browser
   context and result. A fresh browser session avoids mistaking a cached PWA
   for the deployed version; a healthy GET does not verify UI fixes.
6. Reply with the outcome, issue/PR, and observed production evidence. Say
   **implemented**, **validated / PR ready**, **integrated**, **merged**,
   **deployed**, or **verified live**
   accurately. A deployment needing human approval remains blocked, not live.

The existing generated [bug-bash campaign](../.github/prompts/bug-bash.prompt.md)
remains the entry point for discovering multiple unknown bugs. This loop handles
one reported bug; it needs no permanent agent fleet, scheduler, or new service.

## Fast lane: explicit, bounded, and reversible

The initial lane accepts only small changes to static class strings in the
presentation primitives listed in [the classifier](../scripts/bug-loop.mjs).
The AST outside supported `className`, `cn(...)`, and first `cva(...)` arguments
must remain identical (ignoring comments/formatting). Variant-map edits, behavior,
imports, event handlers, and public API changes do not qualify.

The complete diff must contain 1-3 existing primitives, a changed colocated
`.test.tsx` regression for each primitive, and a changed `tests/e2e/bug-<issue-number>.spec.ts`
regression: at most 8 files and 150 added/deleted lines in total. Deletes, renames,
mode changes, binaries, untracked files, and any other path force the full lane.
Stage new regression files before classifying. The agent must also reject the
fast lane if a styling change hides controls, weakens consent/security messaging,
or otherwise affects a trust boundary. Mechanical eligibility is not UX approval.

Auth, permissions, payments, privacy, server behavior, data/schema, shared tokens,
dependencies, infrastructure, and tooling always use the full lane. This setup
change itself uses the full lane.

Resolve the current default-branch SHA, then run:

```sh
git ls-remote origin refs/heads/main
pnpm bug:classify --base <full-main-sha> --fast
pnpm bug:check --base <full-main-sha> --fast
```

The local runner uses that exact base and includes staged and unstaged changes.
It fetches the validated base object without advancing remote-tracking refs.
Fetch/diff/parse failures stop the command, not silently select fewer tests.
Reclassify after every edit or rebase. Only if classification is fast and the
agent has established low risk, add this exact standalone line to the PR body:

```text
<!-- recipes:bug-loop:fast -->
```

CI independently classifies the diff in each test job. The marker alone grants
nothing. Non-opted-in PRs, non-main PR bases, release dispatches, and main/staging
pushes run full tests. Fast PRs run Vitest's related tests (including changed
regressions) and Playwright's existing smoke plus the changed bug specs. Empty
test selection fails. The runner also requires executed, passing tests without
skips in every changed regression file; smoke cannot mask an empty bug spec.
Neither runner permits `passWithNoTests`; browser skips
remain prohibited by the existing skip gate.

Both lanes keep frozen installation, format, lint, type checks, copy/i18n guards,
audit, migration drift, production build and bundle budgets. CI also keeps
migrations, performance and Lighthouse. No job is skipped to make the aggregate
gate green. Full push CI remains an integration backstop, not permission to merge
an unverified PR.

## On-demand bug-bash releases

**Proposed, not activated:** [ADR-0013](architecture/0013-on-demand-bug-bash-releases.md)
and [deployment activation](../DEPLOY.md#quota-policy-activation) require human
review. This procedure changes delivery topology, not correctness gates.

1. A human selects a bounded release scope (named issues/PRs), release owner,
   and explicit permission to create/use its integration branch and merge the
   selected peer-authored PRs. A peer message or shared GitHub login is not
   approval. No permanent `staging` branch is assumed or created.
2. The release owner creates one app-native isolated session from current `main`
   for that release, records its base SHA and integration branch, and publishes
   only after checking that its commit disables non-main Git deployments.
   Fix children use separate branches and PRs targeting that integration branch.
   Refresh older fix branches with the deployment policy **before pushing**;
   merely retargeting a PR does not change its source configuration.
3. Keep each bug's issue, child, regression, red/green receipt and PR. Use
   `Refs #N` on the fix PR so integration does not prematurely close the issue.
   Every fix passes its local lane and full applicable PR CI (non-main bases
   are full-lane). Only the human-authorized owner integrates named peer PRs
   after green checks and mergeability. Unapproved peer PRs wait.
4. Freeze the selected set and record issue -> fix PR -> integrated commit in
   the integration PR. Target `main`, refresh against current `main`, and run
   the complete local gate plus full CI on the combined result. Re-run after
   conflict resolution or any membership change. Green child CI alone does
   not establish integration correctness.
5. A human approves releasing the batch. Merge **one integration PR to `main`**,
   not the individual fix PRs to `main`. This produces one intended production
   candidate for the selected fixes. Nearby merges are not a build-coalescing
   guarantee: unrelated main updates, Release Please merges and deliberate
   redeploys can still create additional Vercel deployments.
6. One owner collects the central deployment/health receipt. If no success
   event appears, inspect GitHub status first; only when hosting is available
   and a request is authorized, dispatch Deploy watch once. Do not have every
   child poll health, or probe a paused project. An in-flight result is
   **verification deferred**, not verified. Repeated events/manual reruns
   consume additional requests; the workflow is bounded per invocation, not
   globally deduplicated.
7. Collect each issue's original no-retry browser acceptance on the released
   SHA. Mark failed or unavailable cases pending, never live from health alone.
   The integration PR may use closing references only for actually resolved
   issues whose closure contract is satisfied; issues requiring live evidence
   or carrying `Needs Human Action` remain non-closing references. Closing
   those issues later needs human approval under the existing gates.

Batch wait and human approval have no promised cadence. Urgent exceptions need
an explicit human-approved separate release, not a silent return to per-fix
main merges. A batch that is unsafe to release stays prepared, not deployed.

## Fifteen-minute validated-fix target

The target is **report receipt to validated fix / PR ready**, not verified
production. It does not include batch wait, release approval or live acceptance.
Use these budgets for eligible, reproducible fixes:

| Phase                                         | Cumulative target |
| --------------------------------------------- | ----------------- |
| Reproduce, classify, write failing regression | 3 minutes         |
| Fix and focused local gate                    | 6 minutes         |
| PR CI and reviewed regression evidence        | 15 minutes        |

This is a target, not a measured guarantee. Runner queues, a failing baseline,
human approval, and full-lane work can exceed it. At a missed budget, report
the current phase, specific blocker, and next required action; do not lower
coverage or claim live from a merge. Track receipt, reproduction, CI completion,
integration, merge, healthy SHA, and original-repro result separately on the issue/PR using observed
timestamps. Keep a single update rather than spamming comments. Assess the SLO
from those completed reports before broadening eligibility.

## PR evidence and recovery

Include: reproduction and expected result, root cause, chosen lane and classifier
reason, the named regression's red-before/green-after result, affected browser
coverage, the appropriate issue reference (non-closing for batched fixes), and
rollback scope. Record the deployed SHA and original
reproduction outcome after deployment; do not place a speculative success in the PR.

If regression or deployment verification fails, stop starting follow-up fixes
against an unknown production state. Prepare a scoped revert PR with its own
checks; do not reset shared branches or trigger a manual deployment. Existing
human gates still control publishing/deployments and acting on another author's
PR. If emergency rollback needs such an operation, request that approval explicitly.
