"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { NotebookPen, Star, Trash2 } from "lucide-react";

import {
  deleteReviewAction,
  upsertReviewAction,
} from "~/server/engagement/actions";
import type { ReviewListItem, ReviewSort } from "~/server/engagement/reviews";
import { cn } from "~/lib/utils";
import { formatRelativeTime } from "~/lib/dates";
import { useServerAction } from "~/lib/use-server-action";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { Textarea } from "~/components/ui/textarea";
import { ImageUploadField } from "~/components/ui/image-upload";

type ViewerReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  photoUrl: string | null;
};

function StarRow({
  value,
  onChange,
  size = "size-6",
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: string;
}) {
  const interactive = Boolean(onChange);
  return (
    <div
      className="flex items-center gap-0.5"
      role={interactive ? "group" : undefined}
      aria-label={interactive ? "Your star rating" : `${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value >= n;
        const star = (
          <Star
            className={cn(
              size,
              active
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-muted-foreground",
            )}
          />
        );
        return interactive ? (
          <button
            key={n}
            type="button"
            aria-label={`Rate ${n} ${n === 1 ? "star" : "stars"}`}
            aria-pressed={value === n}
            onClick={() => onChange?.(n)}
            className="rounded-full p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {star}
          </button>
        ) : (
          <span key={n} aria-hidden>
            {star}
          </span>
        );
      })}
    </div>
  );
}

export function ReviewsSection({
  recipeId,
  recipeSlug,
  initialReviews,
  viewerReview,
  currentUserId,
  canReview,
  isRecipeOwner,
}: {
  recipeId: string;
  recipeSlug: string;
  initialReviews: ReviewListItem[];
  viewerReview: ViewerReview | null;
  currentUserId: string | null;
  canReview: boolean;
  isRecipeOwner: boolean;
}) {
  const locale = useLocale();
  const [sort, setSort] = React.useState<ReviewSort>("recent");
  const [rating, setRating] = React.useState(viewerReview?.rating ?? 0);
  const [title, setTitle] = React.useState(viewerReview?.title ?? "");
  const [body, setBody] = React.useState(viewerReview?.body ?? "");
  const [photoUrl, setPhotoUrl] = React.useState(viewerReview?.photoUrl ?? "");

  const save = useServerAction(upsertReviewAction, {
    successToast: viewerReview ? "Review updated." : "Review posted.",
    errorToast: true,
    refresh: true,
  });
  const remove = useServerAction(deleteReviewAction, {
    successToast: "Review deleted.",
    errorToast: true,
    refresh: true,
    onSuccess: () => {
      setRating(0);
      setTitle("");
      setBody("");
      setPhotoUrl("");
    },
  });

  const sorted = React.useMemo(() => {
    const copy = [...initialReviews];
    copy.sort((a, b) =>
      sort === "rating"
        ? b.rating - a.rating ||
          b.createdAt.getTime() - a.createdAt.getTime()
        : b.createdAt.getTime() - a.createdAt.getTime(),
    );
    return copy;
  }, [initialReviews, sort]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rating < 1) return;
    save.run({ recipeId, recipeSlug, rating, title, body, photoUrl });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-token sm:p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-primary/12 p-2 text-primary">
          <NotebookPen className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">
            Reviews &amp; tasting notes
          </h2>
          <p className="text-sm text-muted-foreground">
            A considered star rating and note — how it turned out, what you
            changed.
          </p>
        </div>
      </div>

      {canReview ? (
        <form onSubmit={submit} className="mt-5 rounded-xl bg-muted/45 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <StarRow value={rating} onChange={setRating} />
            <span className="text-xs text-muted-foreground">
              {viewerReview ? "Editing your review" : "Your star rating"}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <Label htmlFor="review-title" className="sr-only">
                Review title
              </Label>
              <Input
                id="review-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title (optional) — e.g. “A weeknight winner”"
                maxLength={200}
                disabled={save.pending}
              />
            </div>
            <div>
              <Label htmlFor="review-body" className="sr-only">
                Review
              </Label>
              <Textarea
                id="review-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="How did it turn out? What would you change next time?"
                className="min-h-24 resize-y bg-background"
                maxLength={4000}
                disabled={save.pending}
              />
            </div>
            <ImageUploadField
              value={photoUrl}
              onChange={setPhotoUrl}
              label="Photo (optional)"
              size="compact"
              folder="heirloom/reviews"
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              One review per recipe — you can edit or delete yours anytime.
            </p>
            <div className="flex items-center gap-2">
              {viewerReview ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={remove.pending}
                  onClick={() =>
                    remove.run({ reviewId: viewerReview.id, recipeSlug })
                  }
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 /> Delete
                </Button>
              ) : null}
              <Button
                type="submit"
                size="sm"
                disabled={save.pending || rating < 1}
              >
                {save.pending
                  ? "Saving…"
                  : viewerReview
                    ? "Update review"
                    : "Post review"}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/35 p-4 text-sm text-muted-foreground">
          Sign in to leave a star rating and a written review.
        </div>
      )}

      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {initialReviews.length}{" "}
          {initialReviews.length === 1 ? "review" : "reviews"}
        </p>
        {initialReviews.length > 1 ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={sort === "recent" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSort("recent")}
            >
              Most recent
            </Button>
            <Button
              type="button"
              variant={sort === "rating" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSort("rating")}
            >
              Highest rated
            </Button>
          </div>
        ) : null}
      </div>

      <Separator className="my-4" />

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
          No reviews yet — be the first to share how it turned out.
        </p>
      ) : (
        <ul className="space-y-4">
          {sorted.map((review) => {
            const name = review.author?.name ?? review.author?.handle ?? "Family cook";
            const canDelete =
              isRecipeOwner ||
              (currentUserId != null && currentUserId === review.author?.id);
            return (
              <li
                key={review.id}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="flex items-start gap-3">
                  <Avatar className="size-9">
                    {review.author?.avatarUrl ? (
                      <AvatarImage src={review.author.avatarUrl} alt={name} />
                    ) : null}
                    <AvatarFallback>
                      {name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
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
                        <span className="text-xs text-muted-foreground">
                          (edited)
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1">
                      <StarRow value={review.rating} size="size-4" />
                    </div>
                    {review.title ? (
                      <p className="mt-2 font-medium text-foreground">
                        {review.title}
                      </p>
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
                          alt={`${name}'s photo`}
                          className="max-h-72 w-full object-cover"
                        />
                      </figure>
                    ) : null}
                  </div>
                  {canDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Delete review"
                      disabled={remove.pending}
                      onClick={() =>
                        remove.run({ reviewId: review.id, recipeSlug })
                      }
                      className="size-8 text-muted-foreground"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
