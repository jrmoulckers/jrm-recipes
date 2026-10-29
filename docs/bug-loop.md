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
   and mergeability. Self-merge only a PR opened in this session after every
   required check passes. Do not modify settings, secrets, or deployment gates.
5. Observe the existing Vercel deployment and
   [deployment watcher](../.github/workflows/deploy-watch.yml). Require production
   `/api/health` to report the deployed commit SHA, `status=ok`, and `db=ok`.
   Re-run the original user-visible reproduction on that deployment. A fresh
   browser session avoids mistaking a cached PWA for the deployed version.
6. Reply with the outcome, issue/PR, and observed production evidence. Say
   **implemented**, **PR ready**, **merged**, **deployed**, or **verified live**
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

## Fifteen-minute target

The SLO is **report receipt to verified production**, not commit-to-merge.
Use these budgets for eligible, reproducible fixes:

| Phase                                         | Cumulative target |
| --------------------------------------------- | ----------------- |
| Reproduce, classify, write failing regression | 3 minutes         |
| Fix and focused local gate                    | 6 minutes         |
| PR CI and merge                               | 12 minutes        |
| Observe deployment and recheck original bug   | 15 minutes        |

This is a target, not a measured guarantee. Runner queues, a failing baseline,
human approval, and deployment latency can exceed it. At a missed budget, report
the current phase, specific blocker, and next required action; do not lower
coverage or claim live from a merge. Track receipt, reproduction, CI completion,
merge, healthy SHA, and original-repro result on the issue/PR using observed
timestamps. Keep a single update rather than spamming comments. Assess the SLO
from those completed reports before broadening eligibility.

## PR evidence and recovery

Include: reproduction and expected result, root cause, chosen lane and classifier
reason, the named regression's red-before/green-after result, affected browser
coverage, `Closes #N`, and rollback scope. Record the deployed SHA and original
reproduction outcome after deployment; do not place a speculative success in the PR.

If regression or deployment verification fails, stop starting follow-up fixes
against an unknown production state. Prepare a scoped revert PR with its own
checks; do not reset shared branches or trigger a manual deployment. Existing
human gates still control publishing/deployments and acting on another author's
PR. If emergency rollback needs such an operation, request that approval explicitly.
