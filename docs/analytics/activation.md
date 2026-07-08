# Activation & onboarding funnel

This doc defines Heirloom's **activation metric** and the onboarding funnel that
leads to it, and maps each funnel step to a concrete analytics event so the
funnel is reproducible from data.

## Definition of an "activated" family

> A new user is **activated** when, **within 7 days of signing up**, they both
> **create at least one recipe** *and* **start at least one cook** — _or_ they
> join a group that already has recipes.

### Rationale

- Heirloom's core loop is _write a recipe → cook it → keep it in the family_.
  Creating a recipe alone is a shallow signal (people try the editor and leave);
  cooking alone can't happen without content. Requiring **both** captures a user
  who has felt the product's central value, not just poked at it.
- The **group** branch recognises that a family member invited into an existing
  cookbook is already activated the moment they can cook from shared
  recipes — they don't need to author one first.
- **7 days** balances signal and speed: long enough for a family to cook on a
  weekend, short enough to react to activation regressions and to evaluate
  onboarding experiments (see `experiments/`).

Activation is a **per-user** metric keyed by the internal user id (never PII),
the same distinct id used by identify (#321), so it composes with cohort
retention (see `retention.md`).

## The funnel

| # | Step             | Event                 | Where it fires                                            |
| - | ---------------- | --------------------- | --------------------------------------------------------- |
| 1 | Land             | `landing_viewed`      | Marketing landing page (`src/app/(main)/page.tsx`).       |
| 2 | Start sign-up    | `signup_started`      | Clerk `SignUpButton` CTAs (`src/components/auth/`).       |
| 3 | Complete sign-up | `signup_completed`    | First app-side user sync (`src/server/auth`).             |
| 4 | First recipe     | `first_recipe_created`| `createRecipeAction` when the author's count reaches 1.   |
| 5 | First cook       | `first_cook_started`  | Cook Mode start (`use-cook-session` / `cook-tracking`).   |

`landing → signup_started → signup_completed → first_recipe_created →
first_cook_started` is the ordered funnel; the **activation rate** is the share
of `signup_completed` users who reach both `first_recipe_created` **and**
`first_cook_started` within 7 days.

### First-time (once-only) semantics

Steps 4 and 5 are **first-time** events and must never double-count on repeat
actions:

- **`first_recipe_created`** is emitted from the recipe-create server action
  only when the author's total recipe count first equals 1
  (`db.$count(recipes, authorId)`), so it fires once per user. The generic
  `recipe_created` event still fires on every create for volume metrics.
- **`first_cook_started`** is derived from a device-local marker
  (`markFirstCookStarted`, key `heirloom.cook.first`) set the first time any cook
  session begins. Subsequent cooks — of the same or a different recipe, or after
  a reload — report `isFirstEver: false` and emit nothing. Being device-local it
  is a privacy-friendly *approximation* of a person-level first cook (no
  server round-trip, nothing stored per user); cross-device first cooks are
  reconciled analytically via the identified distinct id.

`signup_completed` is likewise guarded to fire once, on the insert that first
creates the app user row (a race that hits `onConflictDoNothing` does not
re-emit).

## Privacy

Every event above is attributed to the internal user id or a device-local
marker — never an email, name, or Clerk id. All properties are ids/counts/flags
only, and capture is gated by consent (see `../../src/lib/analytics/consent.ts`
and the consent management work in #324).

## Reproducing the funnel

In the analytics tool, build an ordered funnel over, in sequence:
`landing_viewed → signup_started → signup_completed → first_recipe_created →
first_cook_started`, with a 7-day conversion window keyed on the person. The
largest step-to-step drop-off is the highest-leverage onboarding fix, and is the
target of the first experiment (`experiments/empty-library-cta.md`).
