# CI: what runs, and when green is not green

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) is the quality gate. Vercel
deploys from `main`, so this workflow is the last thing standing between a change
and production.

## What runs

| Trigger                                   | What runs                                                       |
| ----------------------------------------- | --------------------------------------------------------------- |
| Push to `main` or `staging`               | The full gate.                                                  |
| **Every pull request, whatever its base** | The full gate.                                                  |
| `workflow_dispatch`                       | The full gate, but only for the verified Release Please branch. |

Jobs: `Verify dispatch source`, `Quality` (lint, format, semantic PR title),
`Security` (package audit, secret scan), `Copy and i18n guards`, `Web`
(typecheck, unit tests, production build), `Performance`, `Migration drift`,
`Migrations`, `E2E`, `Lighthouse`, plus two jobs that exist to make the signal
readable: `Base freshness` and `Quality gate`.

## Why the pull request trigger has no branch filter

It used to be `pull_request: branches: [main]`, so a PR based on any other branch
ran **none** of the above.

The problem was not the missing checks. It was that their absence presented as
**success**. Vercel and its preview comment are not GitHub Actions, so they
reported regardless, and a stacked PR showed a green check list and
`MERGEABLE`. PR #670 was green for as long as it was stacked and failed the
first-load JS budget the moment it was retargeted at `main`.

Running the gate on every PR costs runner minutes on stacked work. That is the
intended trade: a stacked PR is exactly the PR nobody has validated.

**If you stack a PR,** the gate now runs — but it validates your branch merged
into _its own base_, not into `main`. The `Base freshness` job says so in the run
summary. Retarget at `main` before merging.

## Three ways a green check list still lies

### 1. Stacked PR — fixed

Closed by removing the branch filter. A non-`main`-based PR now runs the same
jobs as any other.

### 2. Conflicting PR — no run at all

When a PR conflicts with its base, GitHub cannot build `refs/pull/N/merge`, so
**no runs are created**. The PR shows no failures because it shows nothing.

No workflow can fix this, because no workflow runs. Two things do:

- Read the mergeability, not just the check list:
  `gh pr view <n> --json mergeable,mergeStateStatus`.
- Required status checks in branch protection. A required check that never runs
  blocks the merge instead of appearing green. `main` is currently unprotected;
  the `Quality gate` job exists so that a single, stable check name can be
  required once someone enables it.

`gh pr update-branch` merges the base in and produces a conflicted merge when the
conflict is real. Rebase instead.

### 3. Stale merge ref — reported, not blocked

A `pull_request` run tests `refs/pull/N/merge`, a merge commit built when the PR
last changed. If the base has moved since, the run pairs one side's tests with
the other side's source. Both directions mislead:

- **Red** looks like a defect in your diff. On PR #690 the failing test had
  already been fixed on `main` by #693; the run predated it.
- **Green** certifies a tree that no longer exists. This is the expensive
  direction, because red invites scrutiny and green does not.

`gh run rerun --failed` does **not** help. It replays the original event payload,
so it checks out the same stale merge commit and fails on identical assertions.
Only a rebase produces a new merge ref:

```bash
git fetch origin && git rebase origin/main
git push --force-with-lease
```

The `Base freshness` job reports how many commits the base gained after the merge
ref was built, as a warning annotation and a run summary. It is deliberately
**non-blocking**: failing a PR because `main` moved would go red constantly for a
reason that is not the author's diff, and the fix is a rebase the workflow must
not perform on your branch. Treat the warning as a review-time question — if it
says the base has moved and the change is not trivial, rebase before merging.

## Reading the signal

Never read green as green without confirming a real run exists and is newer than
the base:

```bash
gh pr view <n> --json mergeable,mergeStateStatus,baseRefOid
gh pr checks <n>
```

- No GitHub Actions rows at all → nothing ran. Check for conflicts.
- `Quality gate` not present or not `pass` → something did not run.
- `Base freshness` warning → the results describe an older base.
- A red **Vercel** check is never a verdict on your diff, and it is **not a
  required check** — `Quality gate` is the name that matters. But it is not
  uninformative either, and it currently has two distinct causes that need
  telling apart, because only one of them ever clears on its own:
  - **A 401 installing `@jrmoulckers/*`** — deterministic, and the state since
    #804 added the private presets. Actions authenticates to GitHub Packages;
    Vercel has no credential. Every build fails identically. Tracked by #826.
  - **`Deployment rate limited`** — account-wide saturation. The cap is shared
    across every PR and every session, not per branch.

  In both cases: **merge through it, and do not push to clear it.** A retry
  cannot fix the 401, and either way a fresh build spends budget belonging to
  the other open PRs — pushing to clear one red takes it from everyone else.

  Note the asymmetry that let the first cause hide behind the second for so
  long: `Deployment rate limited` is emitted for deploys that **never started**,
  so it is structurally incapable of reporting on builds that ran. A saturation
  error is never a diagnosis.

  "Carries no information about the diff" does not generalise to "carries no
  information". Right now this check is the only surface reporting that
  production deploys are broken at all — see #828, which is the same gap stated
  from the other end.

### Which red is this?

`gh pr checks` prints `Vercel fail` for both causes, so the colour cannot tell you
them apart and neither can `state`. The discriminator is the `description`, which is
already recorded and free to read:

```bash
gh api repos/jrmoulckers/jrm-recipes/commits/<sha>/status \
  --jq '.statuses[] | select(.context == "Vercel") | .description'
```

- `Deployment rate limited — retry in 24 hours.` → account-wide quota.
- `Deployment has failed — run this Vercel CLI command: ...` → the build ran and
  broke. Read the log before assuming it is #826; a third cause would look the same.

A second discriminator needs no prose parsing, because a quota-blocked deploy is
**never created**:

```bash
gh api 'repos/jrmoulckers/jrm-recipes/deployments?environment=Production&per_page=40' \
  --jq '.[] | "\(.id) \(.created_at) \(.sha[0:8])"'
```

That absence carries a counting hazard worth stating explicitly: enumerating
_failed_ Production deployments **undercounts** undeployed commits, because
quota-blocked commits are missing from that list rather than present-and-red. To
measure real drift, compare `main` against the last **successful** deployment sha
rather than counting failures:

```bash
git rev-list --count <last-successful-sha>..origin/main
```

The reason to write this down is that the previous two entries were correct and
still left the red unread. Naming a cause lets you _recall_ an explanation; only a
command lets you _re-derive_ which one is in front of you, and an explanation that
is never re-derived decays into a guess that happens to be phrased confidently.

### The answer is per-attempt, so do not generalise it

The two modes **interleave commit by commit**. There is no boundary and no window to
wait out. Classifying the newest twelve commits on `main` gave:

```
BREAK  3f9fe3cb   QUOTA  cedf27e4   QUOTA  1ceb399b   QUOTA  ebd85b52
BREAK  88d90018   QUOTA  5dae741a   BREAK  7690a1bc   QUOTA  eb5a7350
BREAK  adb09543   BREAK  41b6a583   BREAK  48602be3   QUOTA  8ca0b100
```

The decisive case is a pair with **byte-identical trees** — a PR head and its own
squash-merge commit:

```bash
git diff --stat 33e54369 3f9fe3cb   # empty
# 33e54369 -> Deployment rate limited — retry in 24 hours.
# 3f9fe3cb -> Deployment has failed — ...
```

Same bytes, minutes apart, opposite modes. **The mode is a property of the deploy
attempt — not of the diff, and not of the hour.** One observation therefore licenses
no claim about any other commit, including a rerun of the same one. Statements like
"the quota window has passed" or "Vercel red is quota right now" are unsupportable
from a single read, in either direction, and both have been asserted here.

Re-derive per commit. It is two API calls, and the two discriminators are genuinely
independent: `rate limited` holds **if and only if** no Production deployment object
exists, and `has failed` **if and only if** one exists and failed — 14 of 14 commits
agreed, 0 disagreed. Checking either one confirms the other.

## Every session is the same GitHub user

Concurrent sessions all authenticate as one account, so the platform cannot tell
them apart:

```bash
gh api user --jq .login   # jrmoulckers, from every session
```

Three things follow, and each one has already cost real rounds of work.

**An approval cannot arrive.** GitHub refuses self-approval — `gh pr review <n>
--approve` returns `Review Can not approve your own pull request` — so `reviews[]`
stays empty and `reviewDecision` stays blank however many sessions read the diff:

```bash
gh pr view <n> --json reviewDecision,reviews --jq '"[\(.reviewDecision)] \(.reviews|length)"'
# [] 0   — even with four review comments posted
```

Waiting for an approval before merging is waiting for something structurally
impossible. **A PR comment is the only available form of second-party review**, so
read the comments, not `reviewDecision`. Authors self-merge once `Quality gate`
passes and the PR is `MERGEABLE`; nobody is coming to approve it.

**Authorship is unverifiable.** Every issue, PR, comment and review renders under
the same login, so no session can confirm which session wrote anything. This has
misattributed work in both directions. It also means any tally of the form
"session X did this N times" is unsound — the platform cannot distinguish the
sessions being counted, so the count is not evidence.

The rule this forces: **provenance must be self-declared in the body, or it does
not exist.** The `(#819)` / `RECONFIRMED (#819)` markers in `bundle-budgets.json`
are the pattern. It is the same discipline as recording a run id and platform
beside a measurement, for the same reason — a claim you cannot re-derive is a
claim you cannot audit, and that applies to _who said it_ exactly as it applies to
_what they measured_.

**`AGENTS.md`'s author-based gate is not observable.** It distinguishes actions on
"your own" PRs from gated ones on "a PR you did not author", but with one identity
every PR reads as your own; a session can only know the difference from its own
memory of creating it. That text is canonical (synced `studio:base` block) and is
not reinterpreted here — the observability gap is tracked in #859 for routing
upstream. Until then, treat the gate as binding on what you _know_ you authored,
not on what the platform reports.

Note the shape, because it is the same one this document is otherwise about: an
empty `reviewDecision` reads as _not yet reviewed_ when it actually means _cannot
be reviewed_. **The impossible state and the pending state are the same value.**

## After merge

A PR stops being updated the moment it merges, so the post-merge run on `main` is
attached to nothing anyone reads. `gh pr checks` reports the head ref's run, not
`main`'s. To check the branch that actually ships:

```bash
gh api repos/jrmoulckers/jrm-recipes/commits/main/status --jq '.state'
gh run list --branch main --limit 5
```

`deploy-watch.yml` covers the deploy half of this, in three jobs that fail for
different reasons — and the split is the point:

- **Report failed production deployment** fires on `deployment_status`. It sees
  builds that ran and broke.
- **Production drift** polls hourly and compares `main` against the commit
  production reports it is serving. It exists because the first job cannot
  see a deploy that never started: a quota-blocked attempt creates no deployment
  object, so no event is published and no run appears at all (#868). Over twelve
  consecutive commits, a Deploy watch run existed if and only if a deployment
  object did — five never reached production and produced no run, no event, and a
  green Actions tab.
- **Verify production is serving the deployed commit** fires on a _successful_
  `deployment_status`. It sees deploys that reported success without reaching
  users.

The drift job asserts the property actually wanted — production is serving `main`
— rather than the absence of a known failure. That is why it needs no knowledge
of either mode and will not go blind when a third appears. An event-triggered
check can only ever report things that happened; **absence has to be polled for.**

### Ask production, don't ask the API

`GET /api/health` returns the commit the running build was produced from, plus a
live database probe:

```bash
curl -s https://heirloom.jrmoulckers.com/api/health
# {"status":"ok","version":"0.2.0","sha":"5c23673f…","db":"ok","time":"…"}
```

That `sha` is **ground truth and the deployments API is not.** The API records
what Vercel _intended_; the endpoint records what users are actually being
served. They agree almost always, and diverge in exactly the case no
"successful" record can show you — a build that succeeded but never became the
live alias. So the drift job reads the endpoint and uses the API only to
tolerate an in-flight deploy and to classify the failure mode (#871).

This also collapses the cost: finding the last successful deploy through the API
took a walk of up to 100 requests to infer a fact one unauthenticated GET states
outright.

Use it when a peer reports a deploy state, before believing either of you:

```bash
curl -s https://heirloom.jrmoulckers.com/api/health   # what is served
git rev-list --count <that sha>..origin/main          # how far behind
```

### To know what production says, read the deployed tree

The sha above is not just for drift arithmetic. It tells you which tree to read when the
question is _what does production actually say right now_ — a question that comes up
constantly for user-facing copy and that **cannot be answered from `main` or from a diff.**

```bash
sha=$(curl -s https://heirloom.jrmoulckers.com/api/health | jq -r .sha)
git show "$sha":src/components/settings/delete-account-panel.tsx
git show "$sha":src/messages/en.json
```

Read the _rendered whole_, not the change that produced it. A commit tells you what moved;
it does not tell you what a given user sees, because what they see is the sum of every
commit before it plus the conditions around it.

The worked example is #873. A held user's deletion panel was correctly reported as showing
a contradiction in production. The accompanying claim — that this made production worse than
the state before it — was false, and it was false because it was read off where the diff
placed a block. The same commit also swapped the confirmation help and the button label from
"Permanently delete everything" to "Send my deletion request", so the decision point was
truthful even while the list above it was not. One `git show` of the deployed tree shows
both; the diff shows one and reads as complete.

Corollary, and it has now bitten in both directions: **merged is not live.** A fix that is
on `main` is not a fix a user has. Before describing production behaviour — especially
privacy copy — resolve the deployed sha first.

### What the success check does not cover

The post-deploy job is unauthenticated, so it asserts two things only: the sha
production serves matches the sha Vercel deployed, and `status`/`db` are `ok`.
It does **not** exercise the deletion panel or any signed-in privacy surface —
those need a session and belong in E2E.

Worth stating because the failure it guards against is subtle: a check that
covers part of a surface reads, later and to someone else, as covering the
surface. That is how #868 happened — a workflow that went red on real deploy
failures became the evidence people cited that failed deploys were visible,
while a whole class of them produced no run at all.
