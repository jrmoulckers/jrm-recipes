# Performance budgets: how to attribute a regression

Route budgets live in `bundle-budgets.json` and are enforced by
`scripts/check-bundle-budget.mjs` against what `next build` reports as First Load
JS. This document is about the part the gate cannot enforce: **the stated reason a
route grew.**

Every budget bump in that file carries a prose `//` note explaining what caused
it. Those notes are read as precedent — later bumps cite earlier ones — so a wrong
one propagates. Four have had to be corrected after the fact. This is what they
have in common and how to avoid adding a fifth.

## Two different failure modes, not one

The four corrections are usually described as a single pattern. They are not.
Read individually they split cleanly, and the split matters because only one of
them is guardable.

| Correction  | Failure                                                     | Kind        |
| ----------- | ----------------------------------------------------------- | ----------- |
| #674 / #690 | "catalog copy lands in the shared chunk, ~1 kB every route" | attribution |
| #763        | #690's own replacement guess: "likely #666's URL rename"    | attribution |
| #820        | a recorded `307` that the route had since outgrown          | decay       |
| #821 / #857 | "the food classifier import lands in first-load"            | attribution |

**Attribution errors** state the wrong cause for a real number. The number is
sound; the explanation is invented. All three were reached the same way — by
reasoning about which module _must_ be responsible, rather than removing it and
rebuilding.

**Decay** is different in kind. #820's `307` was _correct when written_. Nothing
was mis-reasoned. The route grew to 308, the note did not, and a figure that was
once a measurement quietly became a guess. A planned tightening to 306 was
abandoned on the strength of it.

### A correction of my own count

`//food-classifier-correction` in `bundle-budgets.json` says this was "the third
diagnosis in this file corrected by measurement (#674 catalogs, #820 stale figure,
this one), and all three were reached by reasoning about which module 'must' be
responsible." **That grouping is wrong in both directions.** It includes #820,
which was decay and involved no module reasoning at all, and it omits #763, which
was an attribution error and belongs in the set.

The tempting generalisation — _all four corrections came from guessing at
modules_ — over-reaches in the same way. It sweeps decay into a category whose
remedy does not apply to it. Stubbing an import cannot fix a number that was right
when recorded.

## Only one of the two is guarded

`bundle-budgets.json` carries a machine-checked `//measured.claims` array, and
`check-bundle-budget.mjs` verifies each entry against the same build that enforces
the budgets, failing on a mismatch (#858). **That closes decay and nothing else.**
A claim's `kb` is compared to a measurement; its surrounding prose is not read.

So the guard would have caught #820 — the `307` — on the first CI run after the
route reached 308. It would not have caught #674, #763 or #821, because in each of
those the number was already right.

Two properties of that guard worth knowing before you rely on it:

- **A claim is only about the platform that produced it.** Linux CI reads roughly
  1 kB above a local Windows build, so entries for another platform `SKIP`. On a
  developer machine all four currently skip and zero are verified — a clean local
  `pnpm check:bundle` is therefore not evidence about claims. They are only ever
  checked on Linux CI.
- **A claim with no `platform` fails as malformed**, rather than skipping. An
  unqualified number is not checkable, and silently skipping it would reopen the
  hole.

Attribution has no equivalent and cannot get one. No gate can verify "this import
is why". Only removing the module and rebuilding can.

## The experiment that settles a cause

Before writing "route X grew because of module Y", or bumping a budget on that
basis:

1. **Stub it.** Replace the suspected import with an inline constant.
2. **Rebuild** and compare First Load JS for the route.
3. **Assert the referent is actually gone** — grep the route's first-load chunks
   for a distinctive identifier from the removed module and confirm zero hits.
4. **Keep a positive control** — a second identifier that should _still_ be
   present, confirming the build changed the thing you meant and not more.

Step 3 is what makes a null result readable. Without it, "removing it changed
nothing" and "the removal did not happen" are the same observation. The #821 work
did this: `volumeClass` appeared in **0 of 33** first-load chunks in the stubbed
build while `buttermilk` still appeared in **6** and `sodiumMg` in **1**. Zero
delta, and the zero meant something.

Stronger still, where the change is a merge you can build both sides of: compare
**shared-chunk content hashes**, not just kB totals. #763 showed `/recipes`
byte-identical across #683 despite ~37 new catalog keys x 4 locales. Hash equality
also rules out compensating changes that a kB total would hide, and `next build`
prints whole kB at this magnitude, so a total can conceal up to a kilobyte of
movement.

## When you cannot establish the cause, say so

Do not substitute a replacement guess. **#763 exists because a correction
introduced one** — #690 fixed the catalog claim and offered #666's URL rename as
"the likely explanation, but it is untested", which then needed correcting in
turn. A correction is a claim like any other and decays like one.

The rule the file settled on: decline to substitute a guess, but **replace an
abstention with a measurement as soon as one exists.** Add the measurement in
place of the abstention rather than beside it — leaving both standing reads as
though the measurement settled nothing.

## Practical rules

- Size a new budget from **CI figures, not local ones** (Linux reads ~1 kB high).
- A new or raised budget must leave **2 kB of headroom** (#796). Inheriting an
  existing tight budget is not a failure; three routes sit at zero headroom for
  exactly that reason, tracked in #821.
- A sub-kB webpack redistribution can move a route a full displayed kilobyte with
  no code change — measured at **145 bytes** in #789. A route that moved 1 kB has
  not necessarily gained anything.
- When you update a claim, **update its `runId` too.** A value you cannot
  re-derive is a value you cannot audit.
- Zero headroom is the underlying fault behind most of these notes. A route with
  no margin turns `main` red on an unrelated PR, and the red route is usually not
  the cause.
