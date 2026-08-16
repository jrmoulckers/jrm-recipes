'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, NotebookPen, Star, Trash2, Users } from 'lucide-react';

import {
  deleteReviewAction,
  removeRatingAction,
  setRatingAction,
  upsertReviewAction,
} from '~/server/engagement/actions';
import type { RatingBreakdownResult } from '~/server/engagement/queries';
import type { ReviewListItem, ReviewSort } from '~/server/engagement/reviews';
import { cn } from '~/lib/utils';
import { formatRelativeTime } from '~/lib/dates';
import { useReducedMotion } from '~/lib/use-reduced-motion';
import { useServerAction } from '~/lib/use-server-action';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Separator } from '~/components/ui/separator';
import { StarRating } from '~/components/ui/star-rating';
import { Textarea } from '~/components/ui/textarea';
import { ImageUploadField } from '~/components/ui/image-upload';
import { ReactionBar } from '~/components/engagement/reaction-bar';
import { ContentActionsMenu } from '~/components/moderation/content-actions-menu';
import type { ReactionCount, ReactionEmojiKey } from '~/lib/reactions';

type ViewerReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  photoUrl: string | null;
};

/**
 * Move the breakdown by one member's vote so the summary, the distribution
 * bars, and the empty state all respond to a tap immediately. The server
 * refresh that follows replaces this with the authoritative numbers (and the
 * rater avatars, which we can't synthesize client-side).
 */
function applyRatingChange(
  breakdown: RatingBreakdownResult,
  previous: number | null,
  next: number | null,
): RatingBreakdownResult {
  if (previous === next) return breakdown;

  let count = breakdown.count;
  let total = breakdown.average * breakdown.count;
  const distribution = breakdown.distribution.map((row) => ({ ...row }));
  const shift = (star: number, delta: number) => {
    const row = distribution.find((entry) => entry.star === star);
    if (row) row.count = Math.max(0, row.count + delta);
  };

  if (previous != null) {
    total -= previous;
    count -= 1;
    shift(previous, -1);
  }
  if (next != null) {
    total += next;
    count += 1;
    shift(next, 1);
  }

  count = Math.max(0, count);
  return {
    ...breakdown,
    count,
    average: count > 0 ? Math.round((total / count) * 10) / 10 : 0,
    distribution,
  };
}

export type RatingsReviewsSectionProps = {
  recipeId: string;
  recipeSlug: string;
  breakdown: RatingBreakdownResult;
  viewerRating: number | null;
  viewerReview: ViewerReview | null;
  initialReviews: ReviewListItem[];
  reactionsByReview?: Record<
    string,
    {
      counts: ReactionCount[];
      reactors: Partial<Record<ReactionEmojiKey, string[]>>;
    }
  >;
  currentUserId: string | null;
  isRecipeOwner: boolean;
  /** Signed in: may write a note. The recipe author may too — see `canRate`. */
  canReview: boolean;
  /** Signed in and not the author: a self-rating is excluded from aggregates. */
  canRate: boolean;
};

/**
 * "Ratings & reviews" (#1010): one card, one star row, one empty state.
 *
 * This replaces three stacked siblings — a review composer with its own stars,
 * a separate one-tap rating control, and a separate breakdown card — that each
 * rendered their own "No ratings yet" and disagreed about what the viewer had
 * rated. Here the star row *is* the viewer's rating and saves on click; a
 * title, note, and photo are an optional expansion of that same star.
 *
 * The conversation thread stays a wholly separate section: commenting and
 * suggesting never require or surface a rating.
 */
export function RatingsReviewsSection({
  recipeId,
  recipeSlug,
  breakdown: initialBreakdown,
  viewerRating: initialViewerRating,
  viewerReview,
  initialReviews,
  reactionsByReview = {},
  currentUserId,
  isRecipeOwner,
  canReview,
  canRate,
}: RatingsReviewsSectionProps) {
  const locale = useLocale();
  const t = useTranslations('engagement.ratingsReviews');
  const reducedMotion = useReducedMotion();

  const [breakdown, setBreakdown] = React.useState(initialBreakdown);
  const [rating, setRating] = React.useState<number | null>(
    initialViewerRating ?? viewerReview?.rating ?? null,
  );
  const [sort, setSort] = React.useState<ReviewSort>('recent');
  const [notesOpen, setNotesOpen] = React.useState(viewerReview != null);
  const [title, setTitle] = React.useState(viewerReview?.title ?? '');
  const [body, setBody] = React.useState(viewerReview?.body ?? '');
  const [photoUrl, setPhotoUrl] = React.useState(viewerReview?.photoUrl ?? '');
  // The just-committed star (plus a retrigger key) that drives the staggered
  // pop. Null except right after a rating is set, so hover and mount stay calm.
  const [commit, setCommit] = React.useState<{ value: number; key: number } | null>(null);

  // Snapshot of pre-click state so a failed submit rolls the stars back.
  const rollback = React.useRef<{
    rating: number | null;
    breakdown: RatingBreakdownResult;
  }>({
    rating: initialViewerRating ?? viewerReview?.rating ?? null,
    breakdown: initialBreakdown,
  });

  React.useEffect(() => {
    setBreakdown(initialBreakdown);
  }, [initialBreakdown]);

  React.useEffect(() => {
    setRating(initialViewerRating ?? viewerReview?.rating ?? null);
  }, [initialViewerRating, viewerReview?.rating]);

  const saveRating = useServerAction(
    (input: { recipeId: string; recipeSlug: string; value: number | null }) =>
      input.value == null
        ? removeRatingAction({
            recipeId: input.recipeId,
            recipeSlug: input.recipeSlug,
          })
        : setRatingAction({
            recipeId: input.recipeId,
            recipeSlug: input.recipeSlug,
            value: input.value,
          }),
    {
      successToast: (_result, input) =>
        input.value == null ? t('toast.ratingCleared') : t('toast.ratingSaved'),
      errorToast: true,
      refresh: true,
      onError: () => {
        setRating(rollback.current.rating);
        setBreakdown(rollback.current.breakdown);
      },
    },
  );

  const saveReview = useServerAction(upsertReviewAction, {
    successToast: viewerReview ? t('toast.reviewUpdated') : t('toast.reviewPosted'),
    errorToast: true,
    refresh: true,
  });

  const removeReview = useServerAction(deleteReviewAction, {
    successToast: t('toast.reviewDeleted'),
    errorToast: true,
    refresh: true,
    onSuccess: () => {
      // The star survives the note (see `deleteReview`): a review is an
      // expansion of a rating, so deleting the writing keeps the rating.
      setTitle('');
      setBody('');
      setPhotoUrl('');
      setNotesOpen(false);
    },
  });

  function chooseStar(value: number) {
    if (!canReview || saveRating.pending) return;

    // The author can attach stars to their own tasting note, but those stars
    // are never counted, never saved on their own, and never move the summary.
    if (!canRate) {
      setRating(value);
      return;
    }

    // Toggle-clear only while there's no review holding the star in place.
    const next = rating === value ? (viewerReview ? value : null) : value;
    if (next === rating && next != null) return;

    rollback.current = { rating, breakdown };
    setRating(next);
    setBreakdown(applyRatingChange(breakdown, rating, next));
    if (next != null && !reducedMotion) {
      const committed = next;
      setCommit((current) => ({ value: committed, key: (current?.key ?? 0) + 1 }));
    } else {
      setCommit(null);
    }
    saveRating.run({ recipeId, recipeSlug, value: next });
  }

  const submitReview = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rating == null || rating < 1) return;
    saveReview.run({ recipeId, recipeSlug, rating, title, body, photoUrl });
  };

  const sorted = React.useMemo(() => {
    const copy = [...initialReviews];
    copy.sort((a, b) =>
      sort === 'rating'
        ? b.rating - a.rating || b.createdAt.getTime() - a.createdAt.getTime()
        : b.createdAt.getTime() - a.createdAt.getTime(),
    );
    return copy;
  }, [initialReviews, sort]);

  const { average, count, distribution, raters, totalRaters } = breakdown;
  const maxInDistribution = Math.max(1, ...distribution.map((row) => row.count));
  const overflow = Math.max(0, totalRaters - raters.length);

  const yourRatingHint = !canReview
    ? t('signInToRate')
    : !canRate
      ? t('ownerStarsHint')
      : rating != null
        ? viewerReview
          ? t('yourRatingWithReview', { rating })
          : t('yourRating', { rating })
        : t('tapToRate');

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-token sm:p-5">
      <div className="flex items-start gap-3">
        <span className="bg-primary/12 rounded-full p-2 text-primary">
          <NotebookPen className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">{t('heading')}</h2>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      {/* Summary. One empty state for the whole card, not one per sub-widget. */}
      <div className="mt-5" role="status" aria-live="polite" aria-label={t('a11y.summary')}>
        {count === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noRatingsYet')}</p>
        ) : (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex shrink-0 flex-col items-center gap-1 sm:pe-5">
              <span className="font-display text-4xl font-semibold text-foreground">
                {average.toFixed(1)}
              </span>
              <StarRating
                value={Math.round(average)}
                label={t('a11y.averageStars', { average: average.toFixed(1) })}
                size="size-4"
              />
              <span className="text-xs text-muted-foreground">{t('ratingCount', { count })}</span>
            </div>

            <ul className="flex flex-1 flex-col gap-1.5">
              {distribution.map((row) => {
                const pct = count > 0 ? Math.round((row.count / count) * 100) : 0;
                const width = (row.count / maxInDistribution) * 100;
                return (
                  <li key={row.star} className="flex items-center gap-2 text-sm">
                    <span className="flex w-10 shrink-0 items-center gap-0.5 text-muted-foreground">
                      {row.star}
                      <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                    </span>
                    <span
                      className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={t('a11y.distributionRow', {
                        star: row.star,
                        count: row.count,
                        pct,
                      })}
                    >
                      <span
                        className="block h-full rounded-full bg-amber-400 transition-[width] duration-300 motion-reduce:transition-none"
                        style={{ width: `${width}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-end tabular-nums text-muted-foreground">
                      {row.count}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {raters.length > 0 ? (
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            <div className="flex -space-x-2">
              {raters.map((rater) => {
                const name = rater.name ?? rater.handle ?? t('member');
                return (
                  <Avatar key={rater.id} className="size-7 ring-2 ring-card" title={name}>
                    {rater.avatarUrl ? <AvatarImage src={rater.avatarUrl} alt={name} /> : null}
                    <AvatarFallback className="text-xs">
                      {(rater.name ?? rater.handle ?? '?').trim().slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                );
              })}
            </div>
            {overflow > 0 ? (
              <span className="text-xs text-muted-foreground">
                {t('more', { count: overflow })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <Separator className="my-5" />

      {/* Your star — the single place a member rates this recipe. */}
      <div className="rounded-xl bg-muted/45 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StarRating
            value={rating}
            onChange={chooseStar}
            disabled={!canReview || saveRating.pending}
            label={t('a11y.yourStarRating')}
            starLabel={(value) => t('a11y.rateStars', { count: value })}
            commit={commit}
          />
          <p className="text-xs text-muted-foreground">{yourRatingHint}</p>
        </div>

        {canReview ? (
          <>
            <button
              type="button"
              aria-expanded={notesOpen}
              aria-controls="tasting-note-composer"
              onClick={() => setNotesOpen((open) => !open)}
              className="mt-3 flex items-center gap-1 rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown
                className={cn(
                  'size-4 transition-transform duration-150 motion-reduce:transition-none',
                  notesOpen && 'rotate-180',
                )}
                aria-hidden
              />
              {viewerReview ? t('editNote') : t('addNote')}
            </button>

            {notesOpen ? (
              <form id="tasting-note-composer" onSubmit={submitReview} className="mt-3">
                <div className="flex flex-col gap-3">
                  <div>
                    <Label htmlFor="review-title" className="sr-only">
                      {t('reviewTitleLabel')}
                    </Label>
                    <Input
                      id="review-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={t('titlePlaceholder')}
                      maxLength={200}
                      disabled={saveReview.pending}
                    />
                  </div>
                  <div>
                    <Label htmlFor="review-body" className="sr-only">
                      {t('reviewLabel')}
                    </Label>
                    <Textarea
                      id="review-body"
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder={t('bodyPlaceholder')}
                      className="min-h-24 resize-y bg-background"
                      maxLength={4000}
                      disabled={saveReview.pending}
                    />
                  </div>
                  <ImageUploadField
                    value={photoUrl}
                    onChange={setPhotoUrl}
                    label={t('photoLabel')}
                    size="compact"
                    folder="heirloom/reviews"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {rating == null ? t('starRequired') : t('helper')}
                  </p>
                  <div className="flex items-center gap-2">
                    {viewerReview ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={removeReview.pending}
                        onClick={() => removeReview.run({ reviewId: viewerReview.id, recipeSlug })}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 /> {t('delete')}
                      </Button>
                    ) : null}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={saveReview.pending || rating == null || rating < 1}
                    >
                      {saveReview.pending
                        ? t('saving')
                        : viewerReview
                          ? t('updateNote')
                          : t('postNote')}
                    </Button>
                  </div>
                </div>
              </form>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {t('noteCount', { count: initialReviews.length })}
        </p>
        {initialReviews.length > 1 ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={sort === 'recent' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSort('recent')}
            >
              {t('sort.mostRecent')}
            </Button>
            <Button
              type="button"
              variant={sort === 'rating' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSort('rating')}
            >
              {t('sort.highestRated')}
            </Button>
          </div>
        ) : null}
      </div>

      <Separator className="my-4" />

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <ul className="space-y-4">
          {sorted.map((review) => {
            const name = review.author?.name ?? review.author?.handle ?? t('familyCook');
            const canDelete =
              isRecipeOwner || (currentUserId != null && currentUserId === review.author?.id);
            return (
              <li key={review.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="size-9">
                    {review.author?.avatarUrl ? (
                      <AvatarImage src={review.author.avatarUrl} alt={name} />
                    ) : null}
                    <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-foreground">{name}</span>
                      <time
                        dateTime={new Date(review.createdAt).toISOString()}
                        className="text-xs text-muted-foreground"
                      >
                        {formatRelativeTime(new Date(review.createdAt), locale)}
                      </time>
                      {review.editedAt ? (
                        <span className="text-xs text-muted-foreground">{t('edited')}</span>
                      ) : null}
                    </div>
                    <div className="mt-1">
                      <StarRating
                        value={review.rating}
                        label={t('a11y.outOfStars', { value: review.rating })}
                        size="size-4"
                      />
                    </div>
                    {review.title ? (
                      <p className="mt-2 font-medium text-foreground">{review.title}</p>
                    ) : null}
                    {review.body ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                        {review.body}
                      </p>
                    ) : null}
                    {review.photoUrl ? (
                      <figure className="mt-3 overflow-hidden rounded-lg border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element -- reviewer-supplied URL can't be pre-allowlisted for next/image */}
                        <img
                          src={review.photoUrl}
                          alt={t('photoAlt', { name })}
                          className="max-h-72 w-full object-cover"
                        />
                      </figure>
                    ) : null}
                    <div className="mt-3">
                      <ReactionBar
                        targetType="review"
                        targetId={review.id}
                        recipeSlug={recipeSlug}
                        initialCounts={reactionsByReview[review.id]?.counts ?? []}
                        initialReactors={reactionsByReview[review.id]?.reactors ?? {}}
                        canReact={currentUserId != null}
                      />
                    </div>
                  </div>
                  <ContentActionsMenu
                    targetType="review"
                    targetId={review.id}
                    authorId={review.author?.id ?? null}
                    authorName={name}
                    currentUserId={currentUserId}
                    canDelete={canDelete}
                    onDelete={() => removeReview.run({ reviewId: review.id, recipeSlug })}
                    disabled={removeReview.pending}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
