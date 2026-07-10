"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import {
  Check,
  CornerDownRight,
  Lightbulb,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import {
  addCommentAction,
  applySuggestionAction,
  deleteCommentAction,
  resolveCommentAction,
} from "~/server/engagement/actions";
import type { ThreadedComment } from "~/server/engagement/queries";
import type { MentionCandidate } from "~/lib/mentions";
import { MentionTextarea } from "~/components/engagement/mention-textarea";
import { MentionText } from "~/components/engagement/mention-text";
import { ReactionBar } from "~/components/engagement/reaction-bar";
import { ContentActionsMenu } from "~/components/moderation/content-actions-menu";
import type { ReactionCount, ReactionEmojiKey } from "~/lib/reactions";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { CharacterCounter } from "~/components/ui/character-counter";
import {
  COMMENT_MAX_LENGTH,
  COMMENT_TOO_LONG_MESSAGE,
} from "~/server/engagement/validation";
import { cn } from "~/lib/utils";
import { formatRelativeTime } from "~/lib/dates";

type CommentKind = "comment" | "suggestion";

type PostComment = (
  body: string,
  kind: CommentKind,
  parentId: string | null,
  onSuccess?: () => void,
) => void;

function displayName(author: ThreadedComment["author"]) {
  return author?.name ?? author?.handle ?? "Family cook";
}

function initials(author: ThreadedComment["author"]) {
  return displayName(author)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function relativeTime(date: Date, locale: string) {
  return formatRelativeTime(new Date(date), locale);
}

type CommentReactions = {
  counts: ReactionCount[];
  reactors: Partial<Record<ReactionEmojiKey, string[]>>;
};

export type CommentsSectionProps = {
  recipeId: string;
  recipeSlug: string;
  initialComments: ThreadedComment[];
  currentUserId: string | null;
  isRecipeOwner: boolean;
  canPost: boolean;
  mentionCandidates?: MentionCandidate[];
  reactionsByComment?: Record<string, CommentReactions>;
};

export function CommentsSection(props: CommentsSectionProps) {
  const {
    recipeId,
    recipeSlug,
    initialComments,
    currentUserId,
    isRecipeOwner,
    canPost,
    mentionCandidates = [],
    reactionsByComment = {},
  } = props;
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [comments, setComments] = React.useState(initialComments);
  const [kind, setKind] = React.useState<CommentKind>("comment");
  const [body, setBody] = React.useState("");

  React.useEffect(() => {
    setComments(initialComments);
  }, [initialComments]);

  const postComment: PostComment = (
    nextBody,
    nextKind,
    parentId,
    onSuccess,
  ) => {
    const trimmed = nextBody.trim();
    if (!trimmed) {
      toast.error("Write something before posting.");
      return;
    }

    startTransition(async () => {
      const result = await addCommentAction({
        recipeId,
        recipeSlug,
        parentId: parentId ?? undefined,
        kind: nextKind,
        body: trimmed,
      });

      if (result.ok) {
        toast.success(
          parentId
            ? "Reply posted"
            : nextKind === "suggestion"
              ? "Suggestion shared"
              : "Comment posted",
        );
        onSuccess?.();
        router.refresh();
      } else {
        toast.error(friendlyError(result.error));
      }
    });
  };

  function deleteComment(commentId: string) {
    startTransition(async () => {
      const result = await deleteCommentAction({ commentId, recipeSlug });
      if (result.ok) {
        toast.success("Comment deleted");
        router.refresh();
      } else {
        toast.error(friendlyError(result.error));
      }
    });
  }

  function resolveSuggestion(commentId: string, resolved: boolean) {
    startTransition(async () => {
      const result = await resolveCommentAction({
        commentId,
        recipeSlug,
        resolved,
      });
      if (result.ok) {
        toast.success(resolved ? "Suggestion resolved" : "Suggestion reopened");
        router.refresh();
      } else {
        toast.error(friendlyError(result.error));
      }
    });
  }

  function applySuggestion(suggestionId: string) {
    startTransition(async () => {
      const result = await applySuggestionAction({
        recipeId,
        recipeSlug,
        suggestionId,
      });
      if (result.ok) {
        toast.success("Suggestion applied");
        router.refresh();
      } else {
        toast.error(friendlyError(result.error));
      }
    });
  }

  function submitTopLevel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    postComment(body, kind, null, () => setBody(""));
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-token sm:p-5">
      <div className="flex items-start gap-3">
        <span className="bg-primary/12 rounded-full p-2 text-primary">
          <MessageCircle className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">
            Conversation
          </h2>
          <p className="text-sm text-muted-foreground">
            Ask questions, share how it turned out, or suggest a family tweak.
          </p>
        </div>
      </div>

      <div className="mt-5">
        {canPost ? (
          <form
            onSubmit={submitTopLevel}
            className="rounded-xl bg-muted/45 p-3"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={kind === "comment" ? "secondary" : "ghost"}
                aria-pressed={kind === "comment"}
                onClick={() => setKind("comment")}
              >
                <MessageCircle /> Comment
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={kind === "suggestion"}
                onClick={() => setKind("suggestion")}
                className={cn(
                  kind === "suggestion" &&
                    "bg-warning/20 text-warning-foreground hover:bg-warning/25",
                )}
              >
                <Lightbulb /> Suggestion
              </Button>
            </div>

            <Label htmlFor="comment-body" className="sr-only">
              Comment body
            </Label>
            <MentionTextarea
              id="comment-body"
              value={body}
              onChange={setBody}
              candidates={mentionCandidates}
              placeholder={
                kind === "suggestion"
                  ? "Suggest a change the recipe owner can resolve…"
                  : "Leave a note for the family table… use @ to mention someone"
              }
              className="min-h-28 resize-y bg-background"
              disabled={pending}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {kind === "suggestion"
                  ? "Suggest a change the recipe owner can resolve."
                  : "Share how it turned out or a tweak you'd make."}
              </p>
              <div className="flex items-center gap-3">
                <CharacterCounter
                  value={body.length}
                  max={COMMENT_MAX_LENGTH}
                  overMessage={COMMENT_TOO_LONG_MESSAGE}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending || !body.trim()}
                >
                  {pending ? "Posting…" : "Post"}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/35 p-4 text-sm text-muted-foreground">
            Sign in to add a comment, reply, or suggest a recipe change.
          </div>
        )}
      </div>

      <Separator className="my-5" />

      {comments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center">
          <MessageCircle className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h3 className="font-display text-lg font-semibold text-foreground">
            Start the conversation
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Be the first to ask a question, celebrate a successful bake, or
            leave a helpful suggestion for the recipe owner.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {comments.map((comment) => (
            <li key={comment.id}>
              <CommentItem
                comment={comment}
                recipeSlug={recipeSlug}
                currentUserId={currentUserId}
                isRecipeOwner={isRecipeOwner}
                canPost={canPost}
                pending={pending}
                mentionCandidates={mentionCandidates}
                reactionsByComment={reactionsByComment}
                onPostReply={postComment}
                onDelete={deleteComment}
                onResolve={resolveSuggestion}
                onApply={applySuggestion}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentItem({
  comment,
  recipeSlug,
  currentUserId,
  isRecipeOwner,
  canPost,
  pending,
  mentionCandidates,
  reactionsByComment,
  onPostReply,
  onDelete,
  onResolve,
  onApply,
  depth = 0,
}: {
  comment: ThreadedComment;
  recipeSlug: string;
  currentUserId: string | null;
  isRecipeOwner: boolean;
  canPost: boolean;
  pending: boolean;
  mentionCandidates: MentionCandidate[];
  reactionsByComment: Record<string, CommentReactions>;
  onPostReply: PostComment;
  onDelete: (commentId: string) => void;
  onResolve: (commentId: string, resolved: boolean) => void;
  onApply: (suggestionId: string) => void;
  depth?: number;
}) {
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [replyBody, setReplyBody] = React.useState("");
  const locale = useLocale();
  const authorName = displayName(comment.author);
  const isSuggestion = comment.kind === "suggestion";
  const isApplied = Boolean(comment.appliedAt);
  const isResolved = Boolean(comment.resolvedAt);
  const canManageSuggestion = isSuggestion && isRecipeOwner && !isApplied;
  const canDelete =
    (currentUserId != null && currentUserId === comment.author?.id) ||
    isRecipeOwner;

  function submitReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onPostReply(replyBody, "comment", comment.id, () => {
      setReplyBody("");
      setReplyOpen(false);
    });
  }

  return (
    <article
      className={cn(
        "rounded-xl border border-border bg-background p-4 transition-colors duration-150",
        isSuggestion && "border-warning/40 bg-warning/10",
        isResolved && "border-border bg-muted/45",
      )}
    >
      <div className="flex gap-3">
        <Avatar className="size-9">
          {comment.author?.avatarUrl ? (
            <AvatarImage src={comment.author.avatarUrl} alt={authorName} />
          ) : null}
          <AvatarFallback>{initials(comment.author)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-foreground">{authorName}</span>
            {comment.author?.handle ? (
              <span className="text-xs text-muted-foreground">
                @{comment.author.handle}
              </span>
            ) : null}
            <time
              dateTime={new Date(comment.createdAt).toISOString()}
              className="text-xs text-muted-foreground"
            >
              {relativeTime(comment.createdAt, locale)}
            </time>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {isSuggestion ? (
              <Badge
                variant="warning"
                className="bg-warning/25 text-warning-foreground"
              >
                <Lightbulb className="size-3" />
                Suggestion
              </Badge>
            ) : null}
            {isSuggestion && comment.anchorLabel ? (
              <Badge
                variant="muted"
                title={`Anchored to ${comment.anchorLabel}`}
              >
                {comment.anchorType === "ingredient" ? "Ingredient" : "Step"}:{" "}
                {comment.anchorLabel}
              </Badge>
            ) : null}
            {isApplied ? (
              <Badge variant="default">
                <Sparkles className="size-3" />
                Applied
              </Badge>
            ) : isResolved ? (
              <Badge variant="success">
                <Check className="size-3" />
                Resolved
              </Badge>
            ) : null}
          </div>

          <p
            className={cn(
              "mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground",
              isResolved && "text-muted-foreground",
            )}
          >
            <MentionText body={comment.body} candidates={mentionCandidates} />
          </p>

          <div className="mt-2">
            <ReactionBar
              targetType="comment"
              targetId={comment.id}
              recipeSlug={recipeSlug}
              initialCounts={reactionsByComment[comment.id]?.counts ?? []}
              initialReactors={reactionsByComment[comment.id]?.reactors ?? {}}
              canReact={currentUserId != null}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1">
            {canPost ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setReplyOpen((open) => !open)}
                className="h-8 px-2 text-muted-foreground"
              >
                <CornerDownRight /> Reply
              </Button>
            ) : null}

            {canManageSuggestion ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => onApply(comment.id)}
                className="h-8 px-2 text-primary hover:bg-primary/10 hover:text-primary"
              >
                <Sparkles /> Accept &amp; apply
              </Button>
            ) : null}

            {canManageSuggestion ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => onResolve(comment.id, !isResolved)}
                className="h-8 px-2 text-muted-foreground"
              >
                <Check /> {isResolved ? "Reopen" : "Resolve"}
              </Button>
            ) : null}

            <ContentActionsMenu
              targetType="comment"
              targetId={comment.id}
              authorId={comment.author?.id ?? null}
              authorName={authorName}
              currentUserId={currentUserId}
              canDelete={canDelete}
              onDelete={() => onDelete(comment.id)}
              disabled={pending}
            />
          </div>

          {replyOpen ? (
            <form
              onSubmit={submitReply}
              className="mt-3 rounded-lg bg-muted/45 p-3"
            >
              <Label htmlFor={`reply-${comment.id}`} className="sr-only">
                Reply
              </Label>
              <MentionTextarea
                id={`reply-${comment.id}`}
                value={replyBody}
                onChange={setReplyBody}
                candidates={mentionCandidates}
                placeholder="Write a reply… use @ to mention someone"
                className="min-h-20 bg-background"
                maxLength={4000}
                disabled={pending}
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReplyBody("");
                    setReplyOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending || !replyBody.trim()}
                >
                  {pending ? "Replying…" : "Reply"}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </div>

      {comment.replies.length > 0 ? (
        <div
          className={cn(
            "mt-4 space-y-3 border-s border-border ps-4",
            depth > 1 && "ps-3",
          )}
        >
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              recipeSlug={recipeSlug}
              currentUserId={currentUserId}
              isRecipeOwner={isRecipeOwner}
              canPost={canPost}
              pending={pending}
              mentionCandidates={mentionCandidates}
              reactionsByComment={reactionsByComment}
              onPostReply={onPostReply}
              onDelete={onDelete}
              onResolve={onResolve}
              onApply={onApply}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}
