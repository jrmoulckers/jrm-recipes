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

## The one defect, and the only remedy that has ever worked

Most of this document is instances of a single class, and it is worth naming once
rather than rediscovering ten times.

**A check whose _absent_ state and whose _passing_ state are the same value.** Each of
these returns a confident, correct answer — to a question other than the one asked:

| Section it is written up under                                                | Absent reads as                         |
| ----------------------------------------------------------------------------- | --------------------------------------- |
| `2. Conflicting PR — no run at all`                                           | no failures                             |
| `UNREAD is a property of the commit, not of the run`                          | terminal and healthy                    |
| the same section, on `gh pr checks`                                           | no row that could be missing            |
| `Every session is the same GitHub user`                                       | not yet reviewed, not _cannot_ be       |
| `A void probe can return the correct answer` (reflog expiry)                  | work never done                         |
| `Key on the subject _text_, because a bare number matches three other things` | absent — or present, via a hex fragment |
| the same section, on per-key spurious rates                                   | freshness audit _certifies_ it          |
| `When no tip is quoted, the verdict is UNDATED`                               | fresh                                   |
| `Comparing the raw counts never terminates` (performance-budgets)             | never satisfiable, so never green       |
| `That answers what a user sees, not what happens when they act`               | safe                                    |
| `A gate means ask, not refuse`                                                | correct, without consulting the world   |

Those are heading texts, not line numbers, deliberately: a line-number cross-reference
is itself an identifier-keyed pointer that goes silently wrong on the next edit. They
are in code spans for the same reason — an early draft italicised them, and the
formatter silently ate the nested `_text_` out of one heading, leaving a reference that
no longer matched what it pointed at. Another draft cited "not the run" for a heading
reading "not _of_ the run".

**Audit the table by parsing the table, never by re-listing what you meant to write:**

```powershell
$lines = Get-Content docs/ci.md
$start = ($lines | Select-String -Pattern '^\| Section it is written up under').LineNumber
for ($i = $start + 1; $i -lt $lines.Count -and $lines[$i] -match '^\|'; $i++) {
  if ($lines[$i] -match '^\|\s*`([^`]+)`') {
    $ref = $matches[1]
    $hit = @('docs/ci.md', 'docs/performance-budgets.md' | ForEach-Object {
        Select-String -Path $_ -Pattern ([regex]::Escape($ref)) |
          Where-Object { $_.Line -match '^#{2,5} ' }
      }).Count
    if ($hit -lt 1) { "BROKEN -> $ref" }
  }
}
```

It is bounded by the table's own header row rather than by a line range, because a line
range is the identifier-keyed pointer this table is about. An unbounded version — every
`| \`` row in the file — reports fifteen false BROKENs from unrelated tables of SHAs and
event names, and an audit that cannot read clean is ignored, which is the failure
recorded under `Comparing the raw counts never terminates`.

The first version of this check compared a **hand-maintained list of intended strings**
against the headings and never read the table — so it confirmed the list rather than the
artifact, and shipped a row reading "But a gate means ask, not refuse" against a heading
with no "But". Nine rows, eight fine, one broken, and a clean pass. That is the
identifier-keyed probe living inside the audit written to catch identifier-keyed probes:
**a check keyed to the author's intent certifies the intent.** Run it after
`prettier --write`, not before, and confirm it can go red by breaking one row.

**The remedy is always to demand a positive assertion, never to look harder for a
failure.** Every fix in this document that worked has that shape — a required
`Quality gate`, the `kb: 307` fixture, `UNREAD`, `UNDATED`, `REFUTED` at the point of
assertion, `claim sites == markers`, calibrating `bare` against `real` locally. Every
attempt that failed tried to detect a bad state by searching for evidence of it, which
cannot distinguish _no evidence_ from _no state_.

That list contains **two mechanically different families**, and knowing which one a
situation calls for is most of the work:

- **Name a third state.** `UNREAD`, `UNDATED`, `REFUTED`, `UNATTRIBUTED` — split one
  ambiguous output value into two, so absence stops sharing a value with pass. These are
  verdicts, and they fix a check that already runs.
- **Impose a precondition.** A required `Quality gate`, the `kb: 307` fixture,
  `claim sites == markers`, calibrating `bare` against `real` in the worktree being
  queried, and the positive control — block the action until an assertion is produced.
  These are gates, and they fix a check that was never established.

**Reach for a third state when the output has too few values. Reach for a precondition
when the input was never established.**

**The split is not taxonomy, it is failure-mode routing** — picking the wrong family fails
in a specific, predictable direction, which follows from the two definitions above. Name a
third state for something that was never established and you have added a value to an
output nobody produces. Impose a precondition on a check that already runs and you gate on
an assertion that was never the missing thing. Both leave the original defect untouched
while producing the appearance of a fix, so the misroute is itself a check whose failure
looks like a pass.

Which means **a misattributed fault selects the wrong instrument.** Had the `zero bits`
claim below stood as _"I did not read the implementation"_, that is a diligence fault, and
diligence is third-state shaped — the fix would be a marker. The actual fault was that no
implementation existed, so there was nothing to mark and only a precondition reaches it.
Getting the diagnosis wrong costs the remedy, not just the record.

The distinction is the difference between advice and a rule that can be enforced:
**"read the artifact first" is advice; "confirm the artifact exists" is a precondition.**
The claim that the pre-#971 reference audit carried _zero bits_ was not a check anybody
skipped — there was no artifact to read, because no executable audit existed before
`bccce831`. No amount of diligence could have produced that claim honestly, which is why
the fix is a precondition rather than more care. `UNATTRIBUTED` came out of the same
episode as its third-state counterpart.

One scope note, because the tidier version was proposed and does not survive contact with
the list: it is not the case that _only_ preconditions work. Four of the fixes above are
third states. Recording the flat version would have been this section's own fourth
direction firing on the exchange that named it.

**One check applies at writing time rather than review time: would this reason still hold
if the contingent fact flipped?** A reason that happens to agree, on a fact that could
have gone the other way, is weaker than one that survives the counterfactual — even when
both reach the same conclusion today. PR #534 is the worked case below: authorship and
publishing both said _human's_, but authorship depended on who opened the PR, while
cutting a release ships 80+ commits whoever opened it. The contingent reason was the one
carried into a summary, because a correct conclusion does not advertise which of its
supports is load-bearing.

Three corollaries, all learned the expensive way:

- **Direction is not safety.** Most instances fail toward false-clean, which is why they
  get hunted. Four did not: a false-_blocked_ merge rule, a false-_alarm_ audit, an
  authorship probe that fails toward _disclaiming_ work, and the amplification of someone
  else's finding past their evidence. A rule that refuses to act reads as conservative, so
  nobody asks whether it can ever be satisfied. Safe-direction failures are unpoliced, not
  harmless — and the last two are worst, for opposite reasons. The authorship probe's only
  available auditor is the party with an incentive not to look. Amplification's only
  available auditor is the party being flattered, who holds the evidence and has every
  incentive to accept. **Restating a peer's finding more strongly reads as generosity from
  the inside**, so it is never checked by either party.

  The live instance: the pre-#971 reference audit was characterised as having _no input
  from the subject whatsoever_, every PASS carrying _zero bits_. That could not have been
  supported by anyone — no executable audit existed in the repository before `bccce831`;
  it lived only in a shell session, so there was no artifact to read. The damage is not
  the overstatement itself but that a flat "null instrument" erases the real, asymmetric
  failure: substring matching passes a row carrying **extra** text, so drift of row away
  from heading is invisible while heading away from row is caught. Collapsing an
  asymmetric instrument into a null one makes its actual blind spot unlearnable.

- **A void test that _agrees_ is never revisited.** One that disagrees gets contradicted
  eventually; one that returns the expected answer gets banked as validated, and the
  instrument is never audited again. So a probe is only as trustworthy as the last time
  it returned something you did not want.
- **A guard's clean record is not evidence it works.** The reference audit below passed a
  live broken row — `But a gate means ask, not refuse`, against a heading with no "But" —
  which sat in `main` from #967 through #969. Outcomes produced by some other mechanism
  get attributed to whatever guard was nominally in place, and the attribution is never
  checked, because the outcomes were correct. This is
  `a conclusion does not carry its derivation` applied to a **track record** rather than
  to a single claim, and it is the more dangerous form: a guard believed to work retires
  the manual check that was actually doing the work.
  **A guard is evidence only once it has been observed to fail on purpose** — break one
  input, watch it go red, and keep that control next to the guard. Two coincidental
  agreements are not a substitute, and they are what a new instrument produces first.

  _Retracted here, at the point of assertion:_ this bullet first claimed the audit was
  "0-for-3" — credited with two catches it did not make. That record is not verifiable
  and the framing was wrong. **No executable audit existed until #971**; before it the
  file carried prose only. The two earlier catches therefore belong to no instrument that
  can be measured, and the honest verdict is the third state this document keeps
  insisting on — **UNATTRIBUTED**, not zero. One confirmed miss stands, and it is enough.
  The claim was written from memory two PRs after recording that _an author auditing his
  own claim consults his intent, not the artifact_.

  What the retraction leaves is sharper than what it removes. The prose said _grep every
  row against the headings_ — table-derived, and correct. What was actually executed was
  keyed to a hand-maintained list of intended strings, so the record came from an
  undocumented substitute while the credit went to the prose. **Prose describing a check
  is not a check**: it has no output, so it can never be observed to fail, and nothing
  forces the thing actually run to resemble it. An instruction to audit is not an audit,
  which is the whole reason the snippet below is executable.

  That yields the one form of this document's remedy that needs no judgement to apply.
  **Prose cannot be given a positive control** — there is no input to break and nothing to
  watch go red. So the test is not advice about rigour; it is a **one-question test for
  whether the thing is a check at all**, and it separates the two categories cleanly every
  time:

  > **Can I break an input and watch this go red — and does my break reach what the check
  > actually reads?**

  Ask it of any guard before trusting a green, and of any procedure before believing it is
  enforced. **Both halves are load-bearing.** The first half alone is satisfiable by a
  mutation the instrument never looks at, which makes it weaker than the manual step it
  replaces — and the half that gets dropped is the one not in the sentence people quote.

  **A control is only as good as the mutation you pick, and the tempting mutation is the
  one nearest to hand.** That is where the second clause comes from. #983 shipped a check
  that counted rows by matching a table row _prefix_. Its first positive control appended a
  character to a cell — the prefix survived, the count held at `3`, and the check read
  green on a file broken on purpose. Trusting that green would have shipped an
  unfalsifiable guard in the pull request about unfalsifiable guards, one commit after
  `a guard is evidence only once it has been observed to fail on purpose`. The control
  inherits the defect it exists to detect: a green produced by a mutation the instrument
  never looks at is absence sharing a value with pass one level up — in the verification
  step rather than in the artifact. The replacement counted rows bounded by the table's own
  header and was proven red twice, on a deleted row and on a broken anchor.

  The same mechanism appears in an unrelated domain below: when the closing-keyword rule
  left a reader with no key, **the fallback nearest to hand was the pull request number —
  the void probe**. The easiest available choice is the one that fails silently.

  **This document has produced that shape three ways, all in its own structure**, and the
  pattern is easier to see together than as three separate fixes:

  | Shape                                       | What had no output        | Fixed in |
  | ------------------------------------------- | ------------------------- | -------- |
  | A pointer to a catalogue that did not exist | the catalogue             | #965     |
  | A catalogue entry with no pointer           | the rule's retrievability | #979     |
  | A procedure with no executable form         | the check itself          | #971     |

  The middle one is the **retrieval** form and the hardest of the three, because it has no
  natural auditor: a check can at least be run and watched, but a rule nobody can find
  produces no event anywhere. **Its absence from every place it should have fired looks
  exactly like it never being needed.** The counterfactual test spent its whole life as a
  single worked example, ~1150 lines from the method section, which is reachable only by
  someone who already had it.

  All three are this section's own defect turned on the document: absence and success
  share a value. And that is not a coincidence of carelessness — **a document is itself an
  instrument with no output**, so nothing forces the practice to resemble it. That is why
  every fix here that held was executable, indexed, or both.

  One scope note, since the overstatement ran the other way too: that check was not
  blind to the file. It read the headings and would have fired had one been renamed. Its
  blind spot is a single direction — substring matching means a row carrying **extra**
  text still matches, so only row text drifting from intent is invisible to it.

  The same corollary applies to a **verification method**, not just to a guard, and that
  form is easier to miss because the method really does produce the answer and the answer
  really is right. This section's location was once confirmed using line-number anchors —
  the pointer type this document warns against — and they resolved, but only because the
  intervening edit happened to land _inside_ the bullet, below both. The method's success
  was contingent on a fact unrelated to the method. So the finding is not "the hazard did
  not fire"; it is **the hazardous method was used and got away with it**, and a clean
  result read as validation of the method is how it survives to be used again. Apply the
  counterfactual above: it will not hold next time, and nothing in the outcome says so.

  The prediction that those anchors _had_ drifted was itself checked, and lost, for one
  command. An anticipated finding with a plausible mechanism behind it is the hardest
  case to check honestly, because it is far more tempting to report than a bare guess.

## Five ways a green check list still lies

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

#### Which base changes actually invalidate a check

The warning tells you the base moved. It does not tell you whether that matters,
and the natural rule for deciding is wrong. Since `prettier.config.js` imports the
vendored `config/engineering/prettier/index.js`, it is tempting to say _a
`chore(config)` or `chore(deps)` merge expires any formatting and lint verification
taken against an earlier base_. Measured against every such merge to date, that rule
fires three times out of three and is right none of them:

| merge           | touched                            | vendored rules     | `src/` reformatted |
| --------------- | ---------------------------------- | ------------------ | ------------------ |
| #881 `89ff57d9` | introduced `config/engineering/**` | new                | 0 files            |
| #883 `b0b98294` | re-pin `v0.15.1` → `v0.15.7`       | **byte-identical** | 0 files            |
| #886 `2a7e1987` | `package.json`, `pnpm-lock.yaml`   | untouched          | 0 files            |

The re-pin is the instructive one. The version moved two minor releases while
`git diff 89ff57d9 b0b98294 -- config/engineering` came back **empty**, so the
version is not a proxy for the rules. Neither is the title: nothing stops a config
edit landing under a `feat(...)` or `fix(...)` subject, and there the title-keyed
rule is silent — it misses the only case that would have mattered.

Ask the property instead. It is one command and it does not care what anything was
called:

```bash
git diff --stat <base-you-verified-against>..origin/main -- \
  config/engineering .prettierignore prettier.config.js eslint.config.js
```

Empty means prior `format:check` and `lint` results survive the base change,
whatever the commit subjects were. Non-empty means re-run them, likewise. This is
the same move as the section below: **select on the property in question, not on a
name you have to guess right first.**

### 4. Run concluded, gate job never did

Observed on PR #878. `Quality gate` sat at `IN_PROGRESS` for 24+ minutes while the
run containing it reported `completed` / `success`:

```
run:  created=14:39:38  updated=14:48:38  status=completed  conclusion=success
job:  Quality gate  started=14:48:35  completed=null  status=in_progress
```

The run was marked complete **three seconds after the gate job started**. Every
other job had finished. `gh pr checks` and the `check-runs` API both said
`in_progress`; only the run conclusion said success — and the run conclusion is the
one that would have authorised a merge, past a gate that never ran.

So the rule is: **the run conclusion is not a substitute for the gate's own
verdict.** A stuck gate is _unread_, not green. Get a real verdict by re-running
that job:

```bash
# Select on .status, not on a name. Prints every non-terminal job with its id.
gh api repos/jrmoulckers/jrm-recipes/actions/runs/<run-id>/jobs?per_page=50 \
  --jq '.jobs[] | select(.status != "completed") | "\(.name) \(.status) \(.id)"'
gh api -X POST repos/jrmoulckers/jrm-recipes/actions/jobs/<job-id>/rerun
```

**It is not specific to `Quality gate`.** That is where it was first seen, but a
later report put `Migration drift` in the same state — unverifiable after the fact,
for the reason in the caveat below — and a PR run carries 15 jobs. A probe written
as `select(.name=="Quality gate")` answers a stuck `Migration drift` run with empty
output, which is the same answer it gives for a clean one. Select on `.status`,
which is the property actually in question, rather than on a name you have to guess
right before you can detect anything.

That returned `completed/success` in about a minute, and the merge proceeded on a
verdict rather than an inference.

**Both of that probe's inputs are assumptions, and both fail on PR #534 today.** It
assumes the run it is handed contains jobs, and that the run it is handed is the
right one. Two CI runs exist on that PR's head commit `3aad1077`:

```
31561428763  completed/action_required  event=pull_request       jobs=0   non-terminal=0
31561427745  in_progress/null           event=workflow_dispatch  jobs=11  non-terminal=3
```

`gh run list --branch <branch> --limit 1` returns the first of those, and the probe
prints nothing for it — the same output a fully-completed healthy run gives. So the
procedure certifies the commit as clean **while three jobs are in progress on it**,
in a run it never opened.

Two separate faults, both toward false-clean:

- **A zero-job run is unread, not clean.** `action_required` means the workflow is
  awaiting approval and no job ever started. `select(...)` over an empty array is
  empty, which is what every-job-passed also looks like. That is this section's own
  rule — a stuck gate is _unread_, not green — reaching a case the section did not
  cover.
- **Newest-run-for-the-branch is the wrong population.** The question is about the
  commit being merged, not the branch. The two runs above differ only by `event`,
  which nothing in the older procedure inspects.

Key on the commit, and assert the population is non-empty before reading it:

```bash
# every run on the merge candidate, not the newest run on its branch
gh api "repos/jrmoulckers/jrm-recipes/actions/runs?head_sha=<full-head-sha>" \
  --jq '.workflow_runs[] | "\(.id) \(.name) \(.status)/\(.conclusion)"'

# per run: jobs=0 means UNREAD -- do not read the emptiness as agreement
gh api "repos/jrmoulckers/jrm-recipes/actions/runs/<run-id>/jobs?per_page=50" \
  --jq 'if (.jobs|length) == 0 then "UNREAD: no jobs (check conclusion for action_required)"
        else (.jobs[] | select(.status != "completed") | "\(.name) \(.status) \(.id)") end'
```

An empty result from the second command means what you want **only once both hold**:
a run was found for the commit, and it contains jobs. The thing that actually
authorises a merge is still the affirmative `Quality gate == SUCCESS`, not the
absence of failures — on #534 `gh pr checks` shows no `Quality gate` row at all,
and nothing in that output says one is missing.

#### UNREAD is a property of the commit, not of the run

The rule above is applied one run at a time, and that is the wrong level. Re-measured
on the same PR later, with a fresh push:

```
31574533504  completed/action_required  event=pull_request       jobs=0
31574533237  in_progress/null           event=workflow_dispatch  jobs=11
```

Same shape, different ids — so the `action_required` run is not a stuck gate someone
forgot to clear. It reappears on **every** push, and `.github/workflows/ci.yml:38-55`
says why: `workflow_dispatch` exists precisely because this PR's event-driven runs are
approval-gated, and `Verify dispatch source` fails closed unless the dispatched ref is
the open same-repository Release Please PR opened by `github-actions[bot]`. The gated
run is the designed state, not the fault.

Read per run, this PR is unread forever — the empty-jobs run can never gain jobs, so
the verdict never clears. Read per commit, it is fine: eleven jobs ran on that exact
sha and all but one were terminal-success. **One unread run among siblings does not
make the commit unread.** Aggregate first, then judge:

```bash
# UNREAD only if NO run on the commit has jobs; otherwise read the ones that do
sha=$(gh pr view <n> --json headRefOid -q .headRefOid)
for r in $(gh api "repos/jrmoulckers/jrm-recipes/actions/runs?head_sha=$sha" \
             --jq '.workflow_runs[].id'); do
  n=$(gh api "repos/jrmoulckers/jrm-recipes/actions/runs/$r/jobs?per_page=50" --jq '.jobs|length')
  echo "$r jobs=$n"
done
```

This is the first entry in this file whose error runs toward **false-blocked** rather
than false-clean, and that is why it survived being written down twice. A rule that
refuses to merge is the safe direction, so nobody audits it — but it still produced a
wrong action, and a confident one: it read as _no CI has ever run on this PR_, when CI
was running and passing at that moment.

Two consequences worth having in advance.

**The remedy is not the approval button.** _Approve and run workflows_ starts the
`pull_request` run once; the next push produces another gated one. The standing remedy
is to dispatch CI and read the dispatch run — which is what the workflow was built for.

**The affirmative this file demands does not exist on that PR.** What authorises a
merge here is `Quality gate == SUCCESS`, and there is no `Quality gate` job on that
commit at all — the run that would carry it is the gated one. So the rule is not
failing, it is **inapplicable**, and the missing row noted earlier in this section is
that inapplicability rather than a symptom of it. The substitute has to be an
affirmative too, not the absence of failures:

> a `workflow_dispatch` run on the merge sha whose jobs are all terminal-success and
> which **includes `Verify dispatch source`** — that job is what proves the dispatch
> was the sanctioned one rather than an arbitrary ref someone typed into the UI.

**And `gh pr checks` will not show you any of it.** It renders the PR's own checks, so
a run reached by a different trigger is not merely unreported — it has no row to be
absent from. On #534 that output is a single rate-limited `Vercel` failure while
eleven dispatch jobs are green underneath it. Same shape as the abbreviated-sha and
newest-run-on-branch faults: the population is selected by something other than the
commit, and what falls outside the selection is indistinguishable from what does not
exist.

Two caveats on the frequency. A census of the 40 most recent completed `ci.yml`
runs found **0** jobs in a non-terminal state, so this is transient rather than
standing; re-measured later at n=30 with the `.status` probe above, still **0**, so
the figure survives the generalization. But that number is weaker than it looks:
**re-running the job erases the evidence**, so the census can only find instances
nobody fixed, and fixing them is the natural response to hitting one. Record the run
id and timestamps _before_ re-running.

### 5. A cancelled run leaves a failure attached to a commit that passed

Observed on PR #896. One commit carried **two `Quality gate` check-runs with
opposite terminal conclusions**:

```
8179044a  Quality gate  completed/success   run=31523484411  started 18:44:59Z
8179044a  Quality gate  completed/failure   run=31522626458  started 18:30:56Z
```

Both belong to the same head SHA, so nothing distinguishes them by commit. The
discriminator is one level up, at the run:

```
run 31523484411  completed/success    head=8179044a  created 18:35:10Z
run 31522626458  completed/cancelled  head=8179044a  created 18:25:20Z
```

The `failure` belongs to a run that concluded **`cancelled`**. Cancellation
records the individual jobs as `failure` while the run itself concludes
`cancelled`, so anything reading job or check-run conclusions sees a red that the
run conclusion would have explained away.

How a commit ends up with two: push A, push B on top (B's run cancels A's
in-flight run under branch concurrency), then force-push back to A. A's second
run is new; A's first, cancelled run stays attached to A forever. Rebase-heavy
branches and any `--force-with-lease` reset reach this state routinely.

`gh pr checks` transiently reported `FAILURE Quality gate` for a commit whose
gate had not failed. **A check-run whose parent run concluded `cancelled` carries
no information about the code** — it records that a run was interrupted, not that
anything was measured. It is neither a pass nor a fail; it is unread, exactly like
the stuck gate in §4.

Read the newest run for the current head SHA, and check the run's own conclusion
before believing a job-level red:

```bash
gh run list --branch <branch> --limit 8 \
  --json databaseId,workflowName,status,conclusion,headSha,createdAt \
  --jq '.[] | "\(.databaseId) \(.headSha[0:8]) \(.workflowName) \(.status)/\(.conclusion)"'
```

Note the failure direction. §1–§4 are all ways a **red is hidden**; this one
manufactures a **spurious red**. That makes it the more dangerous of the two
shapes in practice, because the standard response to an inexplicable red is to
re-run — which produces a third check-run, resolves nothing, and trains the habit
of re-running until green. The evidence that would have identified it as a
cancellation is one API call away and is not erased by the re-run, so read it
first.

## Reading the signal

Never read green as green without confirming a real run exists and is newer than
the base:

```bash
gh pr view <n> --json mergeable,mergeStateStatus,baseRefOid
gh pr checks <n>
```

- No GitHub Actions rows at all → nothing ran. Check for conflicts.
- `Quality gate` not present or not `pass` → something did not run. If it is stuck
  at `IN_PROGRESS` while the run reports success, see §4 above — re-run the job
  rather than reading the run conclusion instead. If it is red for no reason you
  can find in the diff, see §5 — check whether its run concluded `cancelled`
  before re-running.
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
  broke. Do not assume it is #826; a third cause would look the same. You cannot
  read the log from here, so bound the phase instead — see below.

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

**Quote that range in PowerShell**, which is the shell most sessions here run. `..`
is PowerShell's range operator, so an unquoted `$sha..origin/main` is split into two
arguments before git sees it:

```powershell
$sha = "5c23673f"
git rev-list --count $sha..origin/main     # varies  <- wrong
git rev-list --count "$sha..origin/main"   # 69      <- correct
```

```
unquoted -> ["5c23673f", "..origin/main"]   two arguments
quoted   -> ["5c23673f..origin/main"]       one argument
```

Two corrections to how this entry was first written, both from re-measuring it after
a second session reported a different wrong number.

**Only the variable form splits.** A literal `5c23673f..origin/main`, unquoted,
survives as a single token and returns the right answer; it is the `$var..` sequence
PowerShell tokenizes. So the hand-typed spelling is safe and the scripted one is not,
which is the reverse of the usual advice.

**The wrong number is not stable, and not always small.** Split into two arguments,
git counts commits reachable from `<sha>` _or_ `origin/main`, minus those reachable
from `HEAD` — because a bare `..origin/main` means `HEAD..origin/main`. The result is
therefore a function of where your checkout happens to sit, not a symptom:

| `HEAD`                 | unquoted returns         |
| ---------------------- | ------------------------ |
| `origin/main` (synced) | **0**                    |
| one commit behind      | 1                        |
| ~20 commits behind     | 22                       |
| at the served sha      | **69 — correct by luck** |

The quoted truth in every row is 69.

Three consequences, in increasing order of danger. It **can return zero**, on a
checkout synced to `main` — which is exactly where a drift check is most naturally
run, and where zero reads as "production is current". It can be **larger** than the
truth as readily as smaller: two sessions reported `1` and `54` for the same
repository on the same day, and neither figure is a sign to watch for, since both are
just `f(HEAD)`. And it can return **exactly the right answer** when `HEAD` sits at the
served sha — so verifying the command in the obvious way passes while the command
stays broken.

The only durable claim is therefore: **unquoted is wrong and does not error.** Do not
learn a number to recognise. Like `Select-String -SimpleMatch` and the stuck-gate run
conclusion, the instrument returns a well-formed value describing something other than
what you asked.

**Fetch first, for the same reason.** `origin/main` is a local ref that only moves
when you move it, so in a fleet merging steadily the range silently measures how
far a stale copy is behind, and reports it as drift:

```bash
git fetch origin main            # without this the count is against your last fetch
git rev-list --count "<last-successful-sha>..origin/main"
```

A session verifying a reported drift of 58 got 36, from correct arithmetic against
an `origin/main` 22 commits old, and reported it as reproducing the number exactly.
That is the worse half of this failure: a stale ref returns a number that looks like
agreement — and per the table above, so can the quoting bug. Neither reliably
announces itself. Two sessions
running the same command on the same repository can differ by exactly their fetch
gap and neither sees an error.

**ORIGINAL DIAGNOSIS, REFUTED (#936) — retained as the record, not as a live
claim.** The hazard above is real and the remedy stands; this specimen is not an
instance of it. Measured:

```text
5c23673f..174c754c -> 36   174c754c committed 2026-08-11T05:03:51-07:00
5c23673f..187213ca -> 37   187213ca committed 2026-08-11T05:31:44-07:00
174c754c..187213ca -> 1
```

36 and 37 were each exactly right for the true tip when reported, 28 minutes apart,
and the increment matches the single commit that landed between them. **A stale ref
cannot increment** — an unfetched `origin/main` is fixed, so its count is constant.
A ref that advances in step with the true tip is one being fetched, and "22 commits
old, then 23" asks it to move and to fall further behind at once.

The staleness was real and mislocated: the diagnosis was written when `main` stood
at 58, the quoted 36 was compared against that, and it must read low, being from
05:03. **`what` was re-derived correctly and `when` was inherited from context** —
the failure this document describes, committed while describing it.

Both hypotheses predict "36" exactly, which is why reconstructing it felt like
proof. The increment is the discriminator, and it refutes rather than merely
failing to support: _an exact reconstruction of a wrong-looking value is not
evidence of the mechanism that would produce it, when a correct process produces it
too._

**Better: measure with no local ref at all.** `gh api` compares two refs on the
server, so there is nothing to be stale and nothing to remember to fetch:

```bash
gh api repos/jrmoulckers/jrm-recipes/compare/<served-sha>...main --jq .ahead_by
```

That is the form to reach for, with `fetch` + `rev-list` as the offline fallback.
Unlike `deployments?sha=` further down, this endpoint **accepts an abbreviated
sha** — `compare/5c23673f...main` and the full 40-character form both return 79,
matching `rev-list`. Do not carry that tolerance across: the deployments endpoint
answers an abbreviated sha with an empty array and HTTP 200.

The paragraph above was the first attempt at this problem and it was procedural —
it works only for a reader who already has the current file. The same session
reported a stale figure **again** one message later (37, against a ref 23 commits
old), after the mechanism had been explained in detail, because the fix had landed
23 commits ahead of the tree they were reading. **A documentation remedy for
staleness cannot reach a stale reader.** Where that is the failure, change the
command so it cannot express the error, rather than warning about it.

That last rule is the durable part and is unaffected. The 37 is the second half of
the specimen refuted above (#936): it was correct for `187213ca`, the true tip when
it was reported. Read the sentence as an argument for the server-side form, which
holds on its own, and not as an observation of a session reading a stale tree.

#### Attach the referent to the claim, not only to the number

That principle is stated above for the scalar. It needs stating for the
conclusions drawn from it, because the scalar is the half that already survives.

A session reported `main fc4963fa, drift 58`. The number was exactly right —
`5c23673f..fc4963fa` is 58 — and merely 21 commits old. All counting forms agree
at a given tip (`--first-parent`, `--no-merges`, plain; the history is linear with
0 merge commits), so the referent was the entire discrepancy, and **because the
number was quoted with its referent, repairing it took one command.**

The same message relayed a conclusion — that most commits get no deploy attempt,
so a single spot check is likely uninformative and reads as healthy — with no
referent, onward to a third party. The conclusion is wrong; the correction had
already been sent; the two crossed. **A correction travelling peer-to-peer loses
every race against a claim that has already been forwarded.**

#### A crossed repetition is one assertion delivered twice

What happens on the _next_ arrival is worse, because it looks like the opposite. A
peer asserted the same thing in two consecutive messages — that three zero results in
their reflog meant absent — and the second arrival read as reaffirmation under
challenge: a position restated after contradiction, which normally signals the
objection was considered and rejected.

It was not. The message was written before the correction reached them. **One
assertion, delivered twice, and counting it as two inflates confidence in a claim
that has already been refuted** — two of those three negatives were void, the numbers
queried being PRs, which the reflog never holds. Confidence errors in that direction
are the expensive ones.

The discriminator is already in every message and costs one command, because peers
here quote their tip alongside their numbers:

```bash
git log -1 --format='%cI' <their-tip>          # what they could have known
git rev-list --count "<their-tip>..origin/main"
```

`b36d479a` is `2026-08-11T20:03:51`, thirteen commits back; the correction they would
have needed cites `81519901`, which is later. So the message could not have been a
response to it, and its repetition carries nothing new.

**The referent that makes a peer's number self-correcting also dates every other
statement in the same message.** Only the first half of that was written down here,
and the second half is free — no lookup, no recall, and it works on any message
following the convention. It also disposes of the recurring reports of settled work
as still open (`#927` "is yours to merge on the gate"; `#927` is merged) without
re-verifying each one: the tip explains them all at once.

##### When no tip is quoted, the verdict is UNDATED

That rule works "on any message following the convention", and the convention is not a
property of the transport — it is a habit. **When a message quotes no referent, the
discriminator returns nothing, and nothing reads as fresh.** The failure is silent and
it is in the expensive direction: an old claim arrives looking current, which is the
exact state the section was written to prevent. The message that first raised this
objection quoted no tip itself.

The obvious substitute does not work. Cross-session metadata always carries
`from_project_session_branch`, so the branch head looks sender-independent and free:

```text
branch head  docs/formatting-guidance-817  846a1c8b  2026-08-10T18:52:01-07:00
same peer's quoted tip, previous message   81519901  2026-08-11T23:16:44-07:00
```

**29 hours too old.** That branch was last pushed when its PR merged; the peer has
worked from `main`-based branches since, so its head tracks their last push to _that
branch_, not their activity. And it errs toward _ancient_ — it would have me dismiss a
current claim as stale, inverting the fault rather than fixing it. A substitute that
looks principled and is wrong by a day is worse than no substitute, because it
answers confidently.

So there is no verified sender-independent referent, the convention is load-bearing,
and the remedy is a verdict rather than a better instrument:

| message                           | verdict              |
| --------------------------------- | -------------------- |
| quotes a tip behind `origin/main` | STALE by _n_ commits |
| quotes a tip at `origin/main`     | current              |
| quotes no tip                     | **UNDATED**          |

UNDATED is not "fresh" and not "stale". It is the same move as UNREAD above: the
absence of a signal is not evidence of the good case, and the third verdict has to be
named or silence collapses into agreement. If the claim matters, ask for a tip instead
of inferring one — the sender can produce it in one command, and no one else can
produce it at all.

One candidate remains unproven. The local session store keeps a per-turn `timestamp`,
and turn 111's `2026-08-12T07:50:52.526Z` matches the `current_datetime` observed when
that message arrived to within 4 ms. But the newest row's timestamp and its
`user_message` did not align under the same reading, and an instrument whose row
alignment is unproven is exactly what this file keeps telling itself not to adopt.
Recorded as a candidate, not as a method.

So: we attach provenance to numbers and not to the claims drawn from them, and the
claim is what gets acted on. `79 unshipped as of 1064af59` self-corrects. `reads as
healthy` does not. The remedy is structural rather than a warning, matching the
paragraph above: **a claim that will be acted on belongs at the site of action, not
only in a channel that forwards.** The measured census below went on the blocking
issue for that reason — the next reader arrives there anyway, and cannot arrive in
a message thread.

The disputed claim, measured over 14 `main` commits on both channels at once:
**6 of 14 have no deployment object, and 0 of 14 read as healthy.** Quota posts a
terminal `failure` on the statuses channel without ever creating a deployment
object, so no commit reads clear and a one-commit spot check is informative,
provided it is taken on the channel that can express both modes.

### `version` is not a drift signal

`/api/health` also reports a `version`, and it is tempting to read as a coarser
drift axis. Measured across a 60-commit gap, at `3590f177`:

```
package.json at the served commit : 0.2.0
package.json on main              : 0.2.0
health endpoint                   : 0.2.0
```

Identical, because `version` moves only when a release PR merges. It therefore
agrees no matter how far behind production is, and can disagree only in a narrow
window after a release lands. It can produce false reassurance and cannot detect
drift; reading its agreement as currency is the same error as reading an absent
deployment record as success. Compare `sha`.

That same absence sets a subtler trap, and a concurrent session walked into it while
this was being written. Pull the description off every recent **deployment** and they
are byte-identical:

```
dpl_B5rFBz…  Deployment has failed — run this Vercel CLI command: npx vercel inspect … --logs
dpl_2dPR38…  Deployment has failed — run this Vercel CLI command: npx vercel inspect … --logs
dpl_2XTMUf…  Deployment has failed — run this Vercel CLI command: npx vercel inspect … --logs
```

The natural reading is that the deployments channel is **lossy** — that it collapses
both causes into one generic string, and that the fix is to enrich it. That reading
is wrong, and the right one is stronger. The text is uniform because the
**population is filtered**: a quota-blocked attempt never creates a deployment
object, so a list of deployments is already a list of build failures only. Every row
says `has failed` because every row _is_ one. Nothing was lost in encoding.

So absence is not a gap in the instrument, it **is** the instrument — and the same
observation supports the opposite conclusion depending on which reading you take.

The practical consequence, for anyone editing `.github/workflows/deploy-watch.yml`:
**do not classify the failure mode from `deployment_status.description`.** That job
is only ever reached by one of the two modes, so a classifier built on it would look
correct, pass every test written against real events, and be structurally incapable
of seeing the quota case — it would never fire wrongly, it would simply never fire.
Classify from **commit** statuses, which see both, or from duration.

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

### You cannot read the log, but you can bound the phase

The previous entry says to read the log before assuming a `has failed` is #826.
Nobody here can: `npx vercel inspect <id> --logs` is human-run, so no session can
see the actual error. That is why the 401 diagnosis gets **carried** between
sessions instead of re-derived — and a carried cause decays exactly like a carried
status, because it was true when made and nothing revisits it.

Duration is the instrument that does not need log access. The Vercel commit status
goes `pending` → terminal, and the delta between them bounds **where in the build it
died**:

```bash
gh api repos/jrmoulckers/jrm-recipes/commits/<sha>/statuses?per_page=100 \
  --jq '.[] | select(.context|test("vercel";"i")) | "\(.state) \(.created_at) \(.description)"'
```

Measured over every commit in `5c23673f..main` plus the four successes before it.
Both failure counts keep climbing, so treat them as a snapshot with a vintage, not a
constant — the command above is the part worth keeping:

| state                     |   n | `pending` → terminal           |
| ------------------------- | --: | ------------------------------ |
| success                   |   4 | 155 / 162 / 170 / 201 s        |
| `Deployment has failed`   |  17 | **11–17 s**                    |
| `Deployment rate limited` |  29 | **no `pending` status at all** |

The bands do not overlap and are ~9x apart. A build that dies in 11–17 s has not
finished `pnpm install`, let alone `next build`, so every failure in that census
died **at or before install**.

The counts moved (15 → 17 and 25 → 29) while the **bands did not**. That is the
useful part: re-measuring twice, hours apart, changed the population and left the
signature alone, which is much better evidence that the phase is stable than a
single census could ever be.

The quota row is a third discriminator, and a structural one: a rate-limited attempt
emits no `pending` status because no build ever starts. That agrees with the
deployment-object rule above from a different direction and needs no prose parsing.

**What this establishes:** the failure _phase_ is unchanged. "The 401 was partially
fixed and it now fails later" predicts a duration change, and across ~12 hours and 17
attempts there is none — re-measured at n=15 and again at n=17, min 11 s and max 17 s
both times.

**What it does not:** duration cannot name the error. A lockfile fault, a missing
install-time variable, or a registry outage would all produce the same 11–17 s
signature. So the honest claim is "still failing in the install phase, cause
unconfirmed" — not "still the 401". That is a smaller statement, and unlike the
inherited one, any session can re-derive it in a single command.

**`Deploy watch` now runs that command for you.** The failure report used to end
with "read the logs above", pointing at a `log_url` that is the deployment's URL
rather than its build output — an instruction nobody in this repo can follow, which
is precisely how the 401 came to be inherited. It now reports the measured
`pending` → terminal delta and classifies it, so the phase arrives _with_ the
notification. The arm worth knowing about is the second one: a failure that
survives past ~20 s does **not** match the signature of every failure since #804,
and the report says so in those words. Treat that as the standing diagnosis having
expired, not as a slower version of the same fault.

Its **untimed** cases are separated too, because they are not one case. A failed
statuses call and a deploy that recorded no `pending` status used to arrive as the
same empty string and print the same sentence — so an instrument fault read as a
property of the deploy, which is the precise inheritance this job exists to stop.
They are separable in the data: a quota row has a terminal status and no `pending`
one, a failed call has neither. The report now names which it is, and an API failure
says outright that it is an instrument fault to read no cause into.

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

The rule this forces: **provenance must be self-declared in the body**, because
nothing on the platform will supply it. The `(#819)` / `RECONFIRMED (#819)`
markers in `bundle-budgets.json` are the pattern. It is the same discipline as
recording a run id and platform beside a measurement, for the same reason — a
claim you cannot re-derive is a claim you cannot audit, and that applies to _who
said it_ exactly as it applies to _what they measured_.

#### A declaration is checkable: the reflog is per-session

Self-declaration is the only record _on GitHub_. It is not the only record. A
session runs in a worktree, and a worktree's `.git` is a file rather than a
directory:

```text
gitdir: C:/Users/jrmou/src/jrm-recipes/.git/worktrees/<worktree-name>
```

`logs/HEAD` lives under that per-worktree path, so **the HEAD reflog is
per-worktree, and therefore per-session.** It is contemporaneous, and it survives
the loss of the context that produced it:

```bash
# 'commit:' alone misses 'commit (amend):' and 'rebase (pick):', which are
# authorship too -- 130 such entries here, 103 matched, 27 missed (21%),
# including this session's own #895, #887 and #882. That rate is also
# worktree-local: a peer measured 3 of 9 missed (33%), and their entire
# #690 evidence was in the missed third, where zero reads as "not mine".
git reflog --date=iso | grep -E '(commit|commit \(amend\)|rebase \(pick\)):' | grep '#<issue>'
```

**Key it to the issue, never to the PR number.** The local commit message carries
the issue reference; GitHub appends `(#PR)` when it squashes, so the two numbers
never coexist in the reflog and a PR-keyed search returns nothing for work you did:

```text
reflog:  bd933f18 ... commit: docs(ci): attach referents to claims ... (#934)
main:    9c600eff       docs(ci): attach referents to claims ... (#934) (#935)
```

| issue | PR   | reflog `#issue` | reflog `#PR` |
| ----- | ---- | --------------- | ------------ |
| #930  | #931 | PRESENT         | absent       |
| #932  | #933 | PRESENT         | absent       |
| #934  | #935 | PRESENT         | absent       |

The PR number is the one a peer quotes and the one `git log` shows on `main`, so it
is the natural thing to paste in — and it fails in the reassuring direction. It
nearly cost a live error here: a peer attributed the paragraphs above to this
session, `#907` and `#909` came back absent within a covering horizon, and the
conclusion drawn was "not mine". Re-keyed, `#905` and `#908` are both **PRESENT**;
the work is this session's and the attribution was right. #925 documents this
instrument being used to retract a true declaration on memory; this is the same
loss through the instrument itself, which is worse, because it reads as having
been checked.

Prefer it to memory, and **do not retract a declaration on memory alone** when
this can be read instead. Memory fails silently in the way this document is
otherwise entirely about: absence from a session's surviving context and absence
of authorship produce the same output. #925 is the worked case — a declaration of
#820 was retracted as unremembered, and the reflog held two commits for it
(`91a7da93`, `535f5b05`), while four issues the same session had _not_ disputed
were absent. Exactly inverted, and the retraction was the destructive move.

#### Better still: key it to the commit subject

The issue number is an improvement on the PR number, not the best available key, and
it has a failure case that routes straight back into the defect it was written to
prevent. It assumes you can recover the issue for a PR, and sometimes you cannot:

```
$ gh pr view 857 --json closingIssuesReferences -q '.closingIssuesReferences[].number'
(empty)
```

`#857` references `#821` in its subject but does not close it, `#821` being
deliberately still open. A reader following the rule literally is left with no key,
and the fallback nearest to hand is the PR number — the void probe.

**The commit subject has none of these problems.** It survives squash unchanged;
GitHub appends the PR number and touches nothing else:

```text
reflog:  fix(perf): correct the food-classifier diagnosis by measurement (#821)
main:    fix(perf): correct the food-classifier diagnosis by measurement (#821) (#857)
```

So it needs no API lookup, it works when `closingIssuesReferences` is empty, and it
does one thing the issue number structurally cannot: **tell apart two PRs that close
the same issue.** A peer's probe returned three hits all keyed `#674`, spanning
`#690` and `#763` — the issue number could not separate them and the subject text
did. That probe already depended on the subject; the number contributed nothing to
the distinction actually drawn.

Both arms, before trusting it:

```text
POSITIVE  "food-classifier diagnosis by measurement"       -> aeaf69f3  (mine)
NEGATIVE  "catalog-growth diagnosis in the bundle budgets" -> (no matches)
NEGATIVE  "replace the multi-creator budget guess"         -> (no matches)
```

##### Key on the subject _text_, because a bare number matches three other things

The argument above is about availability. There is a second argument, and it is the
stronger one: a bare number in reflog text is **untyped**, and two of its three failure
modes manufacture evidence rather than lose it. Measured in this worktree:

```text
674 : bare=2  real=0      100% spurious
821 : bare=5  real=1        4 spurious
945 : bare=2  real=0      100% spurious
858 : bare=5  real=0      100% spurious
```

**Do not carry those figures anywhere.** They are properties of this worktree, not of
the keys. The same keys, against the same repository, from another session's worktree:

```text
key 674 : bare=3  real=3     0% spurious   (here: 100%)
key 858 : bare=2  real=1    50% spurious   (here: 100%)
key 821 : bare=0  real=0                   (here: 5 / 1)
key 945 : bare=0  real=0                   (here: 2 / 0)
```

Same key, same repo, **100% noise in one worktree and 0% in another**, because the hex
population is a function of which commits that worktree has visited. `674` is not a bad
key; it was a bad key _here_. A rate measured elsewhere is the transplanted number this
document keeps catching — one that decays across **space** rather than time, which is
the harder case to notice, since nothing about it looks out of date.

So calibrate locally before believing any negative:

```powershell
# in the worktree you are about to query
$bare = (git reflog show HEAD --format='%h %gs' | Select-String $n).Count
$real = (git reflog show HEAD --format='%gs' |
         Select-String -Pattern "^(commit|commit \(amend\)|rebase \(pick\)):.*#$n").Count
"$n : bare=$bare real=$real"
```

If `bare` exceeds `real`, the key is matching something other than the reference in
this worktree, and a negative from it is not yet evidence of anything.

**Hex.** SHAs are in the same text as subjects, so a three-digit key hits them:

```text
67a67488 commit: test(recipes): realign the co-creator escalation guard ...
5674864c commit: test(e2e): resolve recipe sub-routes from the canonical ... (#666)
```

Both are `674` inside a SHA, and note both are `commit:` lines — filtering by entry
type does not save you. A peer's positive arm was keyed entirely on `674`; in this
worktree that key returns nothing but noise. It reached the right answer there only
because the subject text was silently doing the work.

**Branch names, which is the one to worry about.** Four of the five `821` hits:

```text
5dae741a checkout: moving from fix/food-classifier-diagnosis-821 to origin/main
aeaf69f3 checkout: moving from 5dae741a... to fix/food-classifier-diagnosis-821
```

That is a **branch name**, and branch names are shared across worktrees — so those
lines appear in a session that checked the branch out and did no work on it. This is
precisely the unconditional-positive fault that got `git branch --list` rejected
earlier, alive **inside the reflog**, the instrument adopted to replace it. Per-session
storage bounds which _entries_ exist; it does not make their _contents_ per-session.
Only `commit:`, `commit (amend):` and `rebase (pick):` entries are authorship evidence:

```bash
git reflog show HEAD --format='%h %gs' | grep -E '(commit|commit \(amend\)|rebase \(pick\)):'
```

Real evidence for `#821` is one line, not five:
`aeaf69f3 commit: fix(perf): correct the food-classifier diagnosis by measurement (#821)`.

The peer's worktree is the control that confirms the mechanism: `821` returns **0 bare
and 0 real** there, because that session never checked the branch out. So `checkout:`
lines are present exactly when _this_ session moved to that branch — real evidence of
presence, and none at all of authorship.

**The squash suffix, which makes PR-keying fail even here.** The subject rule above
notes GitHub appends the PR number; the consequence is that the appended number exists
only on `main`:

```text
local reflog:  docs(ci): key the authorship probe to the commit subject (#944)
origin/main:   docs(ci): key the authorship probe to the commit subject (#944) (#945)
```

`#945` is this session's own work, and a `945` search of its own reflog finds zero real
hits. So "key on the subject" is not sufficient on its own — **key on the subject
text**, and treat any number inside it as untyped until you have checked which of issue,
PR, SHA fragment or branch name it matched.

#### A void probe can return the correct answer

Before trusting any absent result, **check whether the number queried was a PR**:

```bash
gh api repos/jrmoulckers/jrm-recipes/issues/<n> --jq 'if .pull_request then "PR" else "ISSUE" end'
```

A peer reported `#819`, `#820` and `#857` all returning zero within a covering
horizon, and concluded the negative meant absent. `#819` is an issue, so that arm was
valid. **`#820` and `#857` are PRs, so their zeros were structurally guaranteed** and
carried no information at all.

The conclusion drawn from them was nonetheless **correct** — `#857` is this session's,
confirmed by a valid probe on `#821`. That is what makes this the worst form of the
entailed-outcome defect. A void test that disagrees with reality eventually gets
contradicted by something. A void test that **agrees** is never revisited, because the
answer checks out, and an invalid instrument gets banked as a validated one.

Note also that the issue-keyed rule was already written down when this happened. A
rule that exists but is not reached at the point of use has the same effect as no
rule, which is an argument for the key that needs no lookup and no recall.

Two conditions, or the negative result means nothing:

| condition        | check                                   | why                                                         |
| ---------------- | --------------------------------------- | ----------------------------------------------------------- |
| Covers the event | `git reflog \| tail -1` for the horizon | Before the worktree existed, absence has an unrelated cause |
| Has not decayed  | `gc.reflogExpire`, default 90 days      | An expired entry is indistinguishable from work never done  |

**`git branch --list` is not this evidence, though it looks like it.** Worktrees
_share_ refs with the clone, so a session sees every other session's branches —
~230 here, including whichever branch a peer currently occupies. Branch presence
is a property of the clone, so the probe answers _present_ to every query and
reads as confirmation of whatever was asked. It is the identifier-keyed probe in
§`Which base changes actually invalidate a check`, one more time: it was reached
for first, and it "confirmed" #820 for a reason unconnected to authorship.

Two further heuristics get proposed and both fail the same way, so test any
candidate by asking whether **a session that did not do the work would read a
different value**:

| candidate                    | why it fails                                                                                                                                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR head branch name          | Names the _work_, not the author. `gh pr view 861 --json headRefName` returns `feat/verify-measurement-claims-858` to every session alike, and that branch is in this worktree's `branch --list` too. It also does not reliably encode an issue — `fix/closingsep` (#924) carries no number. |
| Session display name ≈ title | Self-declared and mutable, and a session shipping two PRs can match at most one.                                                                                                                                                                                                             |

Measured against the same pair, the reflog does discriminate: the peer's branch
has **no** entry in this worktree, while `fix/closingsep` has its checkout. That
positive-and-negative pair is what qualifies it as a check — a probe seen only
agreeing has not been shown able to disagree.

**Adding more instruments is not a substitute for exercising one.** The corollary
matters because triangulation is the natural next move when a single probe feels
thin, and it is worthless against a subject that is not moving. Production status
here is checked against four things — `/api/health`, the deployments API, the
commit statuses channel, and `package.json` — and all four agree on the served sha.

Nothing has deployed in 20 hours, so the served sha is a **constant**, and every
instrument that reads it correctly must return the same value. Four agreeing
instruments over a frozen subject are not four confirmations; they are one
observation restated four times, and the result would be identical if three of them
were broken.

The information was in the axis where they _disagreed_ — drift, which separates
what is on `main` from what is serving. **Under a static system agreement is free,
and only disagreement carries information.** The `version` axis below is the worked
case: it was proposed as a second signal precisely because it agreed, and it agrees
no matter how far behind production runs.

Branch names are also not immutable: they can be force-pushed, deleted and
recreated.

**`AGENTS.md`'s author-based gate is not observable _between sessions_.** It
distinguishes actions on "your own" PRs from gated ones on "a PR you did not author",
and with one identity every session-authored PR reads as your own; the platform will
not tell a session which it wrote. That text is canonical (synced `studio:base` block)
and is not reinterpreted here — the observability gap is tracked in #859 for routing
upstream. Until then, treat the gate as binding on what you _know_ you authored — and
when that is in doubt, read the reflog above rather than deciding from memory, because
this is the gate where a misremembered answer merges someone else's work.

**It is fully observable for bot authors, and that is the case that matters.** The
ambiguity above is between sessions sharing one identity. A bot is decidable:

```bash
gh pr view 534 --json author -q .author.login    # app/github-actions
```

Check it before merging anything you did not open in this session, because the
unqualified form of the claim above invites the opposite conclusion — _the gate is
unobservable, so it cannot be what stops me_ — on precisely the PRs where it is
observable and does stop you.

#### A gate means ask, not refuse

`AGENTS.md` resolves a gated operation by "stop, state what and why, and **wait for
approval**" — so explicit human instruction _satisfies_ the author gate rather than
being overridden by it. A session told "you can merge any PR that is ready now" has
standing on PRs it did not open, and reading bot-authorship as a permanent wall forbids
the one workflow the human is most likely to authorise. A peer session merged five green
Dependabot bumps under exactly such a grant; under the unqualified form of the paragraph
above, those five were unmergeable.

**And authorship is not what blocks this queue.** Measured across all nine open PRs:

```text
552, 551, 550, 37, 35, 34, 32   no Quality gate job on the head commit
549                             Quality gate completed/failure
534                             Quality gate completed/success
```

Eight of the nine are stopped by **the absence of an affirmative gate** — §4's rule,
needing no authorship question at all. So "bot-authored, therefore refuse" has zero live
applications while reading as though it carries the queue, and it fires identically on a
green human-approved bump and on an unreviewed major that fails CI. A rule that cannot
tell those apart reaches the right answer without consulting the thing that matters,
which is the void probe of this document's opening section wearing a policy costume.

**A green affirmative answers _may this merge_, never _may I merge it_.** Those are
independent questions, and §4's substitute answers only the first. #534 is the worked
example on both counts: its CI question is now fully resolved,

```text
31574533504  pull_request       completed/action_required   jobs=0
31574533237  workflow_dispatch  completed/success           all jobs terminal
```

and it remains human-gated — but **because it publishes**, not because a bot opened it.
Cutting a release ships 80+ commits, and that is gated whoever opened the PR. A human
could have opened #534 and it would be equally unmergeable by a session. Authorship
happens to agree here, on a fact that could have gone the other way; publishing is the
reason that survives the counterfactual. Resolving the CI question moved #534 from
_unmergeable and misdiagnosed_ to _mergeable by a human_; it did not move it to
_mergeable by a session_.

This is not a hypothetical reading. A peer session wrote, in a message to this one,
that "#534 is now _not_" a human-gated item, "which is the practical result of your
message" — a stated conclusion that is wrong as written, about the
highest-consequence PR in the repository.

**That is evidence of the conclusion and of nothing upstream of it.** An earlier
revision of this section said the peer was "working from these sections" and that
the CI finding "carried straight through the unqualified sentence above." Neither was
observed. So the sentence at `:1081` has no demonstrated victim; it has a demonstrated
_hazard_, which is a weaker and honest claim, and enough on its own.

**There was no single derivation to recover.** The peer first reported reaching
_human's_ by a different route — cutting a release is **publishing**, gated on its own —
and having told the human so twice. They then disclosed that both accounts are true at
once: the human was told #534 needed a release decision, and this session was told #534
was "now _not_" a human-gated item, within the same hour. Two contradictory conclusions,
so no route existed that could have produced both. That is the third variant of the rule
below, and the strongest: not merely that a conclusion fails to carry its derivation, but
that there may be **no derivation there to carry**.

**The upgrade this evidence seems to license was requested and is refused.** The peer
asked that `:1081` be restored to a demonstrated victim, on the grounds that the wrong
conclusion was written "by a reader who had just read those sections". That clause is the
same unobserved route claim retracted above, and the disclosure does not support it — if
anything it weakens the link, since the author describes the message to this session as
the loose one. Reinstating a retracted inference at the request of the person it flatters
is the weakest available basis for a claim. **Declining a strengthening asked for by the
affected party is the same discipline as declining a weakening** — and the current
wording came from accepting one of those, which is why this document should not now
accept the other.

**An author auditing their own claim consults their intent, not the artifact.** The peer
answered from memory of what they meant while the sent text sat available and unread, and
the memory was of the version that made them consistent. This is the same asymmetry as a
void probe that agrees: the account that matches what you believe you did is the one you
never go back and check.

**A conclusion does not carry its derivation.** Reading a stated conclusion and
inferring which rule produced it is the same conclusion-to-route inference recorded
above under reflog attribution, where a correct answer arrived by a key that could not
have produced it. This is the inverse — a correct-by-accident route replaced by an
asserted one — and it is the more tempting direction, because a conclusion that matches
what your text would have caused reads as confirmation that your text caused it. Cite
the text. Never cite a reader's route unless they stated it — and note that even a
stated route can be one of several the author is holding at once.

Note the shape, because it is the same one this document is otherwise about: an
empty `reviewDecision` reads as _not yet reviewed_ when it actually means _cannot
be reviewed_. **The impossible state and the pending state are the same value.**

## A closing keyword cannot be negated

GitHub scans the whole of a commit message or PR body for closing keywords. There
is no negation handling and no scoping, so there is no way to _mention_ one
without arming it. Commit `41b6a583` wrote this, and meant it:

```text
Closes #855 is NOT claimed -- #855 stays open for the human decision.

Refs #855, #806, #805
```

#855 closed at `09:10:41Z`. It was reopened a minute later. The sentence existed
only to prevent the close, and typing it caused the close — **the caveat was the
payload.** Note that the correct `Refs` line was already there, one line below;
adding the right reference does not disarm the wrong one.

It failed in the direction that hides work. #855 pins the Neon history-retention
number, an open and human-gated privacy gap, and a closed issue reads as a settled
matter. That commit's own subject was _"point the erasure horizon's blocker at an
open tracker"_, and its body warned that a stale pointer resolving to a closed
issue makes "an open compliance gap look resolved". It then did exactly that, by a
different mechanism, in the same commit.

**The rule: never type a closing keyword you do not mean.** Not under negation,
not in quotes, not to explain that you are not using it. Use `Refs #N` and say the
rest in words — "#N stays open for the human decision" carries the full meaning
with nothing to parse. When you must show the pattern itself, replace the number
with a placeholder (`Closes #NNN`). Do not assume a code fence or an indent
suppresses the scanner; it does not.

### Knowing the rule is not enough — the past tense is the trap

The section above shipped in PR #893. Its body and commit message narrated the
incident with the phrase `closed #855`, and GitHub closed #855 at `17:56:01Z`,
two seconds after the merge commit. **The pull request documenting the bug
reproduced the bug, in the sentence describing it**, written by someone who had
just spent an hour on the mechanism.

That is not carelessness, it is the specific shape of the trap. The keyword set is
nine words, and every tense counts:

|           |            |            |
| --------- | ---------- | ---------- |
| `close`   | `closes`   | `closed`   |
| `fix`     | `fixes`    | `fixed`    |
| `resolve` | `resolves` | `resolved` |

The imperative forms _look_ like instructions, so they get caught by eye. **The
past tense does not.** "…and closed #855 anyway" is narration — a statement about
something that already happened, in a paragraph about history — and it is
indistinguishable to the scanner from an order. The same goes for "fixed #N in the
earlier PR" and "resolved #N last week", which are the most natural way to write a
changelog, a postmortem, or a reply to another session.

So the rule needs its stronger form: **do not put any of those nine words next to
an issue number, in any tense, for any reason.** Write "#N was closed by
`41b6a583`" — passive voice moves the number away from the keyword — or drop the
number.

### It is guarded, and the reason it can be

PR #893 also claimed this could not be checked, because bodies are not in the tree
and any check would run after the close had fired. **The second half is wrong, and
it is the load-bearing half.** The close fires when the pull request _merges_, not
when it is pushed. A check that runs on the pull request therefore lands squarely
before the damage, which makes it a guard and not a report.

`scripts/check-closing-keywords.mjs` runs in the `Copy and i18n guards` job, which
is in the `Quality gate` needs list, so a violation blocks the merge that would
otherwise perform the close. It reads `github.event.pull_request.body` from the
workflow context and every commit message on the PR, and enforces the convention
already written down elsewhere: **a closing reference gets a line of its own.**
Prose mentions are mid-sentence by construction, so "alone on its line" separates
intent from narration without the guard having to understand meaning.

It deliberately does not skip fenced code blocks, because GitHub does not skip
them either — a guard that ignored fences would pass the exact text that closes the
issue, including PR #893's own quotation of the incident.

It was verified against both real pull requests rather than fixtures alone: it
fails #893 (two hits — the body and commit `7a0f1df0`) and passes #891. The pair
matters more than either half; a guard only proven to fire has not been shown to
be capable of passing.

The residue this cannot reach is a body edited after the last CI run, since the
merge uses the current body and the check saw an earlier one. Same shelf-life
problem as `Base freshness`, and worth knowing rather than papering over.

It belongs to the family this document is otherwise about: a scanner reads a
pattern out of surrounding text and cannot see the text that qualifies it. Same
shape as `Select-String -SimpleMatch` matching nothing and reading as _nothing
there_, or a ban on `unsafe-eval` passing over a policy with no `script-src` at
all. This is the sharpest member, because the qualifying text was the entire point
of the sentence — twice, in consecutive pull requests, the second of which was the
fix for the first.

### The other half: a correct close that discards the request

The keyword can also be entirely deliberate and still do damage, because of what
the issue on the other end contains.

`AGENTS.md` tells an agent that when it cannot finish a human-gated step it should
leave a section headed `Needs Human Action`. That note is the fleet's only channel
for routing work back to a person, and nothing stopped a pull request from closing
the issue carrying it.

#859 recorded that the author-based merge gate is unevaluable here, because every
session authenticates as the same GitHub user, and asked a human to decide. PR
#860 documented the trap in this file and closed #859 along with it. The
documentation shipped; the routing request went into a state nobody triages. A
peer session found it by reading the closed issue directly — no check saw it. The
ask was then re-routed by hand to `jrmoulckers/.github#308`, which worked only
because someone happened to look.

Correct syntax, discarded content — so the same script carries a second check.
For each issue a pull request would close, if that issue is **open** and its body
carries that heading, the build fails and names it. The way out is `Refs #N` with
the issue left open, or removing the section if the PR really does resolve it, or
routing the ask somewhere that stays visible and saying so first.

It skips rather than fails on anything it cannot read — a missing issue, an API
error, a pull-request target — because a guard against a silent failure must not
become a source of spurious red. Only bare `#N` is checked; a cross-repository URL
close acts on another repository's issue, and resolving the number here would read
an unrelated one. Already-closed issues are skipped, since merging discards
nothing new.

That skip-safety is also the thing to watch. The lookup needs an explicit
`issues: read` scope, because the job's `permissions` block **replaces** the
default rather than adding to it. Without it every lookup 404s, the check reports
that it skipped, and "skipped" prints the same green as "found nothing wrong" —
this document's own subject, aimed at its own guard. `scripts/workflow-policy.test.mjs`
pins the scope for that reason, and the pin was proved by deleting the line and
watching it fail.

Verified in both directions against live issues rather than fixtures alone: it
fails on #855, which is open and carries the section, and passes on #901, which is
open and does not.

**Quoting the marker re-arms it**, exactly as quoting a closing keyword does. The
first draft of #901 reproduced the heading verbatim to show what #859 had carried,
and the finished guard then refused any pull request that would close #901 —
correctly, by its own rule. Fences do not help, for the reason above and its
mirror: if a fence suppressed this check, an issue could hide its own request for
a human inside one. So describe a hazardous marker; do not reproduce it in a
position where it is live. The same rule applies to issue titles, which is why
#822 was retitled by describing its old title rather than repeating it.

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

### Only `main` commits are evidence about production, and absent is not success

Both of those modes make deployment records treacherous to reason from by hand,
and two sessions have now drawn structural conclusions from them. The two rules
that would have caught it:

**A non-`main` SHA has no Production deployment by construction.** Production
deploys attach to `main`, so a feature-branch tip returns nothing — not a preview,
nothing — and that absence says nothing about deploys. A session tested whether
failure is a property of the attempt rather than the tree by comparing
`33e54369` (no deployment object) against `3f9fe3cb` (failure) with an empty
`git diff` between them. Both facts were structural: `33e54369` is the tip of
`docs/vercel-red-discriminator-864` and `3f9fe3cb` is that same change
squash-merged as #865, so identical trees is what a clean squash _is_, and only
one of the two was ever eligible for a production attempt. Filter to `main` first:

```bash
git branch -a --contains <sha>    # if it is not on main, it is not evidence
```

#### The general defect: a probe whose outcome was entailed by its setup

Filtering to `main` fixes that comparison. It does not help a reader holding a
different probe, so state what actually went wrong: **both observations were
entailed by how the pair was built.** Identical trees is what a clean squash _is_,
and a feature-branch tip cannot carry a production deployment. Neither could have
come out any other way.

Both were true. Both reproduced on demand — a second session re-ran them, got the
same two results, and reported the reproduction to the user as confirmation.
Reproducibility was never the missing property. A measurement that cannot vary
reproduces perfectly and carries no information, while feeling like the strongest
confirmation available.

This is not the absence-read-as-pass mode the rest of this file catalogues. The
probe returns a positive, informative-looking result; it just could not have
returned another one. The test:

> Before reporting a result as confirmation, name the outcome that would have
> falsified it. If none was reachable, the probe measured its own setup.

Here that control was one command — is this commit even eligible for a production
attempt? — and it voids the pair.

This is the same rule as the mutation-proof requirement for a checked-in guard: a
guard observed only agreeing has not been shown capable of disagreeing, which is
why #930's `jq` was run against a jobless run, a non-terminal run, **and** an
all-terminal control before it shipped. Guards and one-off observations get the
same treatment, because a guard is only an observation someone committed.

#### A census inherits the blindness of the channel it is taken on

A `main`-only census over the deployments API found no-deployment-object to be the
majority result, and concluded that a session spot-checking one recent commit is
likely to draw an uninformative reading and take it as clear. The first half holds;
the second does not follow. Measured over the 8 most recent `main` commits, both
channels at once:

| commit     | `deployments?sha=` | Vercel states on `/statuses` |
| ---------- | ------------------ | ---------------------------- |
| `c46531c6` | 1                  | `failure`, `pending`         |
| `c112974f` | 0                  | `failure`                    |
| `b48b79c9` | 0                  | `failure`                    |
| `ec3b694c` | 0                  | `failure`                    |
| `de45d007` | 1                  | `failure`, `pending`         |
| `04cf9aef` | 1                  | `failure`, `pending`         |
| `b36d479a` | 1                  | `failure`, `pending`         |
| `667bee3d` | 1                  | `failure`, `pending`         |

3 absent and 5 present on the deployments API — and **8 of 8 carry a Vercel
`failure` on the statuses channel**, because quota posts a terminal failure without
ever creating a deployment object. No commit reads as clear, so the single most
likely spot-check is informative, provided it is taken on the channel that answers
for both modes.

The conclusion inherited a documented property of the instrument — the mode table
below is what it was blind to — rather than a property of the subject. **Take a
census only on a channel that can express every mode it means to count**, and when
a count is the evidence, say which channel produced it.

**Absent is not success — but read it on the right channel, with a full sha.** The
census behind this rule used the deployments API alone, and that instrument is
wrong twice.

First, **`deployments?sha=` requires the full 40-character sha.** An abbreviated one
returns `[]` — HTTP 200, empty array, no error. Every sha in prose, in
`git log --oneline`, and in `gh pr view` output is abbreviated, so the natural way
to run this census reports "absent" for every commit, including ones that deployed
successfully. `5c23673f` abbreviated returns 0 deployment objects; the same commit
at full length returns 1, and it is the build production is serving right now.
This is **not** a general rule about the API: the `compare` endpoint used for drift
accepts an abbreviated sha and answers correctly, so the tolerance of one endpoint
says nothing about the other.

Second, an absent deployment object at full length does not mean "never attempted,
cause unmeasured". **It means quota**, and Vercel says so on the statuses channel —
which is posted either way, so the two modes are directly distinguishable:

| mode    | deployment object | `pending` status | terminal status                                            |
| ------- | ----------------- | ---------------- | ---------------------------------------------------------- |
| attempt | 1                 | yes              | `success` / `failure`                                      |
| quota   | 0                 | **none**         | `failure` — "Deployment rate limited — retry in 24 hours." |

```bash
gh api repos/jrmoulckers/jrm-recipes/commits/<sha>/statuses \
  --jq '[.[]|select(.context|test("[Vv]ercel"))|"\(.state) \(.description)"]'
```

#### Prefer the statuses channel outright: it dominates the deployments endpoint

The remedy above — keep using `deployments?sha=`, but remember the full sha — is the
weaker one. The statuses channel is better on every axis measured, so the instrument
should be replaced rather than annotated. At `c1d5c55d`:

```
commits/c1d5c55d/statuses    (8 chars)  -> failure,pending
commits/<40 chars>/statuses             -> failure,pending    (agrees)
deployments?sha=c1d5c55d     (8 chars)  -> 0                  (wrong, silently)
```

**The statuses channel tolerates an abbreviated sha**, so the constraint that defeats
the deployments endpoint does not apply to it, and wrapping these calls in
`$(git rev-parse …)` propagates a fault the endpoint does not have. It also answers in
one call instead of two, and it **names the cause in the description** — something the
deployments endpoint cannot do at all, since it only reports existence.

And it loses nothing. Over the most recent 14 `main` commits at `c1d5c55d`, the
correlation with deployment-object existence is **14 of 14 exact**: every
`failure`-alone commit has no deployment object, every `failure,pending` commit has
one. The deployments endpoint carries no information the statuses channel is missing,
while carrying a silent failure mode it does not have.

This is the same move as replacing the local drift count with `gh api compare`: when an
instrument has a silent failure mode and a sound alternative exists, **replace the
instrument instead of documenting its quirk.** A documented quirk still has to be
remembered by every future reader; a retired instrument does not.

#### A census with any PRESENT row proves its own sha width

A census run entirely with abbreviated shas returns **100% absent**. So any non-zero
PRESENT count proves full shas were used — the output validates itself, and no
inspection of the command is needed.

This is worth stating because it is the rare control that is **free and retroactive**.
Most checks in this document require re-running something; this one can be applied to
an archived table whose command is long gone. Both censuses below pass it on their own
face: 5 present of 8, and 10 of 14.

So the original worry — that a session drawing an unattempted commit would read
production as healthy — overstates the hazard on the statuses channel and
understates a different one. **No commit looks healthy:** re-running the census over
the last 14 `main` commits with full shas gives 5 attempts and 9 quota, and all 14
carry a Vercel `failure`. What the deployments API alone cannot do is tell quota
apart from a sha typed at eight characters, because it answers both with `[]`.

Quota is also the larger blocker by count. A correct registry token fixes the 5, and
leaves the 9 without an attempt. — **ORIGINAL RATIO, SUPERSEDED (#942); the conclusion
drawn from it has since inverted.** Re-measured at `c1d5c55d` over the most recent 14
`main` commits: **10 attempts and 4 quota.** The majority are now failing on the
registry credential, so a correct token repairs the **majority**, not the minority.

Both counts were right when taken. "The last 14 commits" is a **sliding window**, and
six merges moved it. The defect is not the number but the standing operational
conclusion built on the ratio — _"the token fixes the minority, expect a staggered
partial recovery"_ — which reversed without anything marking it as stale, and was
relayed onward in that form. All 14 still carry a `failure`, so the part of the finding
that matters for spot-checking is unaffected.

**A ratio needs its window and tip attached, exactly like a count needs its referent.**
A ratio is worse, because a count that goes stale merely reads low, while a ratio that
goes stale can flip the action it recommends and still look plausible.

### The duration band bounds the phase, and that is all it does

Terminal timings across those attempts, taken as `pending` → terminal on the statuses
channel: failures at 12, 12, 13, 13, 14 and 16 seconds, against the single success at 162. Non-overlapping by an order of magnitude, so a terminal failure inside the band
died at or before install.

It cannot name the error. A lockfile fault, a missing install-time variable and a
registry outage all land in the same band. The supportable claim is **"still failing
at or before install, cause unconfirmed"** — strictly smaller than naming a 401, and
re-derivable by anyone in one command.

Its real value is as a **falsifiable success criterion**, which nothing else here
provides: once the registry credential lands, a repaired install phase must move a
failing deploy's terminal status out of the 12–16 s band. A deploy that still dies at
~14 s falsifies the credential as the cause, and does so without waiting for a green.

Recorded because a right conclusion resting on a measurement that cannot support it
survives only until someone re-derives it (#903) — which is what happened to the
6-and-8 figure this section used to quote.

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
gh api repos/jrmoulckers/jrm-recipes/compare/<that sha>...main --jq .ahead_by
```

Both halves are remote, so neither can be stale. The `git fetch origin main` plus
`git rev-list --count "<that sha>..origin/main"` pair measures the same thing
offline, at the cost of a fetch you have to remember.

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

### That answers what a user sees, not what happens when they act

Component × catalogue × condition at one tree tells you which string renders. For a
_safety_ claim it is still not enough, because the condition that picks the copy is
client-side, and the server may or may not re-derive it. The two cases fail in opposite
directions:

- **Server re-derives.** The client condition is presentational. A stale or wrong preview
  can only mislabel; it cannot change what happens. Failures are safe-direction only.
- **Server trusts the client.** The client condition is load-bearing, and a stale preview
  is a security bug rather than a cosmetic one.

Which case you are in is invisible from the component — it looks identical either way — so
read the server path too. **Read the signature, not the identifiers.** The question is
whether any caller-supplied value can reach the hold decision, and that is answered by
types:

```ts
export type ErasureOptions = {
  trigger: DeletionTrigger;
  noticeVersion?: string; // which copy the user was shown
  backupHorizonAt?: Date; // when the last backup expires
};

export async function eraseUserAccount(userId: string, options: ErasureOptions);
```

Three fields, none able to express a hold, and `findEntanglement(userId: string)` takes only
the id. `options` reaches `recordErasureHold` — the _record_ of the hold — never the branch
that decides it. So the property is: **the hold decision's only inputs are the user id and
server-derived state, and the type system forbids a caller supplying anything else.**

The obvious check is weaker and should not be the verdict:

```bash
grep -n "willBeHeld\|heldRecipeCount" src/server/users/erasure.ts   # corroborating only
```

It asks whether two identifiers appear and gets read as whether the decision is independent
of the client. Those come apart under a rename or a differently-routed value, and when they
do it returns **no hits** — indistinguishable from safe. That is the identifier-keyed probe
catalogued under _The one defect, and the only remedy that has ever worked_, here in the
one section where a silent pass licenses the sentence "failures are safe-direction only".

The signature read also yields a review trigger a grep cannot: **adding a field to
`ErasureOptions` is the change that would invalidate the bound.** Watch for that rather than
re-running a string search.

The worked example is the panel from #873. `delete-account-panel.tsx` computes
`willBeHeld = preview.heldRecipeCount > 0` to choose `held.cta` over `confirm.cta`, but
`eraseUserAccount` calls `findEntanglement(userId)` itself and records the hold from its
own result; neither name appears anywhere in `erasure.ts`. The client's condition never
reaches the decision. So a stale preview can show "everything is deleted immediately" to a
user the server will hold, and cannot show "nothing is deleted today" to a user the server
will erase.

That bound is what retires the question, and note what supplies it: not the copy, which is
where the whole investigation was looking. The unconditional consequences list above the
button still says "permanently deleted" and "no undo" to a held user who will lose nothing
today — a real contradiction, and reading further copy would never have settled whether it
was dangerous. Only the server path does.

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
