# ADR-0005: One Star Per Cook

- **Status:** Accepted
- **Date:** 2026-08-16
- **Issue:** [#1010](https://github.com/jrmoulckers/jrm-recipes/issues/1010)

## Context

The recipe **Discussion** tab had grown four sibling cards, added in three separate issues that each
solved their own problem correctly and never reconciled with the others:

| Card                      | Added by | Its own star row? | Its own "no ratings" empty state?             |
| ------------------------- | -------- | ----------------- | --------------------------------------------- |
| Reviews and tasting notes | #341     | Yes, interactive  | Yes ("No reviews yet…")                       |
| Rating control            | #176     | Yes, interactive  | Yes ("No ratings yet / Be the first…")        |
| Rating summary            | #334     | Display only      | Yes ("No ratings yet. Be the first to rate…") |
| Conversation              | #176     | No                | Yes                                           |

The result read as four unrelated widgets rather than one place to react to a recipe.

The deeper problem was in the data, not the layout. `ratings` and `reviews.rating` were
[deliberately independent](../../src/server/db/schema/reviews.ts): aggregate and discover-feed math
read `ratings` and never `reviews`, so rating a recipe inside the review composer did not move the
summary rendered directly beneath it. A member could set four stars in one row and see "No ratings
yet" in the next. Both numbers were correct about their own table and the pair was incoherent on
screen.

A third inconsistency was smaller but the most visible: only the rating control previewed a hover
fill across the stars. The review composer's star row and the Cook Mode completion star row painted
nothing until a value was committed, so the same gesture behaved differently in three places.

## Decision

**A member has one star rating on a recipe.** A written review is an optional expansion of that
star, not a second, independent one.

### `ratings` stays the source of truth; `reviews.rating` mirrors it

`ratings` remains the only table aggregate and feed math reads, so `topRatedScoreSql`, the
denormalized `recipes.rating_count` / `rating_sum`, and the JSON-LD `aggregateRating` are unchanged.
What changes is that `reviews.rating` is no longer allowed to disagree with it:

- `upsertReview` writes the review's star through `writeRating`, inside the same transaction, so
  posting a review moves the aggregates by the same delta a one-tap rating would.
- `setRating` writes back into the caller's review row, if any, so re-tapping the star row cannot
  strand a review displaying a stale number.
- `removeRating` refuses with `RATING_LOCKED_BY_REVIEW` while a review exists. Clearing the star out
  from under a live review is the one operation that could desync the pair, and there is a better
  path for it: delete the review.
- `deleteReview` deliberately leaves the mirrored star standing. A review is an expansion of a
  rating, so removing the writing keeps the rating that was underneath it.

### Recipe authors are the exception

An author may write a tasting note on their own recipe but may not rate it, because a self-rating
would inflate both the average and the JSON-LD `aggregateRating` — which is why
`excludeOwnerRatings` exists and why `setRating` throws `SELF_RATING`. Mirroring therefore skips the
author: their review keeps its star for display, and nothing is written to `ratings`.

This also fixes a pre-existing bug. The tab passed `canInteract={Boolean(user)}` to the rating
control without subtracting the owner, so an author saw an enabled star row whose every click failed
with `SELF_RATING`. The star row is now disabled for them with an explanation instead.

### Two cards, and conversation is not one of them

The tab renders exactly two sections:

1. **Ratings & reviews** — the aggregate breakdown, the viewer's single star row, the optional note
   it expands into, and the list of notes. One empty state for the whole card.
2. **Conversation** — threaded comments and suggestions.

Commenting and suggesting never require, prompt for, or display a star. A question about a
substitution is not a verdict on the recipe, and coupling the two would have suppressed exactly the
low-stakes participation the conversation thread exists to invite.

### One star component

`~/components/ui/star-rating` is the only interactive star row in the product. It owns the
hover/focus preview fill, the commit animation, the disabled state, and the focus ring, so the
affordance cannot drift between surfaces again. Preview is visual only: it paints stars up to the
pointer without announcing or committing a value, leaving `aria-pressed` and the accessible name
describing the committed rating. Because it previews on `focus` as well as `hover`, the affordance
is not pointer-only.

## Consequences

- Rating a recipe from the review composer now moves the discover feed and the JSON-LD, which it
  previously did not. Recipes with existing reviews keep their stars unmirrored until the review is
  next saved; no backfill is run, because inventing rating rows a member never confirmed would
  retroactively change public aggregates.
- `RatingControl`, `RatingSummary`, `ReviewsSection`, and `RecipeReviewsSection` are gone, replaced
  by `RatingsReviewsSection`. Their message namespaces (`engagement.ratingControl`,
  `engagement.ratingSummary`, `engagement.reviews`) collapse into `engagement.ratingsReviews`.
- Clearing a star is no longer possible while a review exists. This is a deliberate reduction: the
  alternative is a control that silently orphans the review it is attached to.
- The tab loads one lazy client chunk instead of two.
