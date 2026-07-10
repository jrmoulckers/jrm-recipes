# Experiment: Empty-library → first-recipe CTA

- **Flag key:** `empty-library-cta` (multivariate)
- **Status:** ready to launch
- **Owner:** Growth / activation
- **Surface:** `src/components/recipe/empty-library-cta.tsx`, rendered by
  `src/app/(main)/recipes/page.tsx` when a signed-in user's library is empty.
- **Depends on:** feature-flag framework (#335), recipe-funnel instrumentation (#310).

## Hypothesis

New families who land on an empty recipe library often leave without creating
their first recipe — the single most important activation step. We believe a
**benefit-led** empty-state CTA (framing the value: "save your family's first
recipe") will motivate more new users to create their first recipe than the
current, task-led copy ("No recipes yet").

> If we replace the generic empty-state copy with benefit-led framing, then the
> share of new users who create their first recipe will increase, because the
> CTA connects the action to the emotional payoff of keeping family recipes.

## Variants

| Variant | Flag value | Description                                                        |
| ------- | ---------- | ------------------------------------------------------------------ |
| Control | `control`  | Current empty state ("No recipes yet"). Preserves the existing UI. |
| Benefit | `benefit`  | Benefit-led heading + body + CTA label.                            |

The flag is multivariate (string) so additional treatments (e.g. a "start from a
sample recipe" shortcut) can be added later without touching call sites — add a
key to `VARIANTS` in `empty-library-cta.tsx`.

Unassigned / unconfigured users always resolve to `control`, so the default,
no-analytics build is unchanged.

## Metrics

- **Primary:** `first_recipe_created` conversion — the share of exposed users who
  fire `first_recipe_created` (see the activation funnel, #328). Exposure is the
  `$feature_flag_called` event emitted on render of the empty state.
- **Secondary:** `recipe_create_started` (funnel entry), time-to-first-recipe.
- **Guardrail:** overall `recipe_created` volume and bounce from `/recipes` must
  not regress.

Analysis is exposure-based: denominator = distinct users with a
`$feature_flag_called` event for `empty-library-cta`; numerator = those who
later fire `first_recipe_created`.

## Design parameters

- **Unit of assignment:** user (distinct id = internal user id, evaluated
  server-side so the variant is stable and there is no flicker).
- **Baseline conversion:** assume ~20% of exposed new users create a first
  recipe (update once the funnel has two weeks of data).
- **Minimum detectable effect (MDE):** +5 percentage points absolute
  (20% → 25%), a relative lift of ~25%.
- **Significance / power:** α = 0.05 (two-sided), power = 0.80.
- **Sample size:** ≈ 1,000 exposed users per variant at the assumed baseline and
  MDE (≈ 2,000 total). Recompute with the observed baseline before calling a
  result.
- **Duration:** run until each variant reaches the sample size **and** at least
  two full weeks have elapsed (to cover weekly seasonality) — expected ~2–4
  weeks. Do not stop early on a peek.

## Rollout & analysis plan

1. Configure the `empty-library-cta` flag in the analytics provider with a 50/50
   `control` / `benefit` split targeting new/empty-library users.
2. Confirm exposures (`$feature_flag_called`) and the primary metric are flowing.
3. At the end of the run, compare `first_recipe_created` conversion between
   variants (two-proportion z-test). Ship `benefit` if it wins on the primary
   metric without tripping guardrails; otherwise keep `control`.
4. Record the outcome below.

## Result

_Pending — to be filled in after the run._
