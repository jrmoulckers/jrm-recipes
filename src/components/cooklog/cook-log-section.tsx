"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import {
  CookingPot,
  Loader2,
  Plus,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { deleteCookLogAction, logCookAction } from "~/server/cooklog/actions";
import type { CookLogItem } from "~/server/cooklog/queries";
import { cookedTimesLabel, formatServingsMade } from "~/server/cooklog/summary";
import { formatDate, formatRelativeTime } from "~/lib/dates";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { ImageUploadField } from "~/components/ui/image-upload";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { CharacterCounter } from "~/components/ui/character-counter";
import {
  COOK_NOTE_MAX_LENGTH,
  COOK_NOTE_TOO_LONG_MESSAGE,
} from "~/server/cooklog/validation";
import { ReactionBar } from "~/components/engagement/reaction-bar";
import type { ReactionCount, ReactionEmojiKey } from "~/lib/reactions";

/** Per-entry reaction tally passed from the server (#342). */
export type EntryReactions = {
  counts: ReactionCount[];
  reactors: Partial<Record<ReactionEmojiKey, string[]>>;
};

export function CookLogSection({
  recipeId,
  recipeSlug,
  recipeTitle,
  entries,
  cookCount,
  canLog,
  canReact = false,
  reactionsByEntry = {},
  shareGroup = null,
  dbConfigured,
}: {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  entries: CookLogItem[];
  cookCount: number;
  canLog: boolean;
  canReact?: boolean;
  reactionsByEntry?: Record<string, EntryReactions>;
  shareGroup?: { id: string; name: string } | null;
  dbConfigured: boolean;
}) {
  if (!dbConfigured) {
    return (
      <section
        className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground"
        aria-label="Cooking journal"
      >
        <div className="flex items-center gap-2">
          <CookingPot className="size-4" aria-hidden="true" />
          Connect a database to start keeping a cooking journal. Set{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            DATABASE_URL
          </code>{" "}
          (see <code className="font-mono text-xs">.env.example</code>).
        </div>
      </section>
    );
  }

  // Recency nudge (#368): with prior cooks, surface "last made … · N times" and a
  // one-tap re-log. Entries arrive newest-first, so entries[0] is the last cook.
  const lastEntry = entries[0] ?? null;
  const lastCookedAt = lastEntry ? new Date(lastEntry.cookedAt) : null;
  const lastServings = lastEntry?.servingsMade ?? null;

  return (
    <section
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 shadow-token sm:p-6"
      aria-label={`Cooking journal for ${recipeTitle}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CookingPot className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold">Cooked it</h2>
            <p className="text-sm text-muted-foreground">
              {cookCount > 0
                ? `You've ${cookedTimesLabel(cookCount).toLowerCase()}. History, kept alive.`
                : "Log each time you make this — build your own history."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {cookCount > 0 && (
            <Badge variant="secondary" className="gap-1.5">
              <CookingPot className="size-3.5" aria-hidden="true" />
              {cookedTimesLabel(cookCount)}
            </Badge>
          )}
          <LogCookButton
            recipeId={recipeId}
            recipeSlug={recipeSlug}
            recipeTitle={recipeTitle}
            canLog={canLog}
            shareGroup={shareGroup}
          />
        </div>
      </div>

      {canLog && cookCount > 0 && lastCookedAt && (
        <LogAgainNudge
          recipeId={recipeId}
          recipeSlug={recipeSlug}
          lastCookedAt={lastCookedAt}
          cookCount={cookCount}
          lastServings={lastServings}
        />
      )}

      {entries.length > 0 ? (
        <CookLogTimeline
          entries={entries}
          recipeSlug={recipeSlug}
          canReact={canReact}
          reactionsByEntry={reactionsByEntry}
        />
      ) : (
        <EmptyCookLog />
      )}
    </section>
  );
}

function EmptyCookLog() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-background/60 py-10 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <UtensilsCrossed className="size-6" aria-hidden="true" />
      </span>
      <p className="font-medium">No cooks logged yet</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        The first time you make this, log it — notes, tweaks, and a photo become
        part of the recipe&apos;s story.
      </p>
    </div>
  );
}

/**
 * "Made it again?" recency nudge (#368). Shown when the viewer has cooked this
 * recipe before: surfaces how long ago and how many times, plus a one-tap
 * "Log again" that records a fresh cook (dated now, servings prefilled from the
 * last entry) via the existing {@link logCookAction}. Reuses the cook-log data
 * already on the page, so no extra queries. Notes/photos remain available
 * through the full "I cooked this" dialog.
 */
function LogAgainNudge({
  recipeId,
  recipeSlug,
  lastCookedAt,
  cookCount,
  lastServings,
}: {
  recipeId: string;
  recipeSlug: string;
  lastCookedAt: Date;
  cookCount: number;
  lastServings: number | null;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const valid = !Number.isNaN(lastCookedAt.getTime());

  function onLogAgain() {
    if (pending) return;
    startTransition(async () => {
      const result = await logCookAction({
        recipeId,
        recipeSlug,
        servingsMade: lastServings ?? undefined,
      });
      if (result.ok) {
        toast.success(
          `Logged again — ${cookedTimesLabel(cookCount + 1).toLowerCase()}`,
        );
        router.refresh();
        return;
      }
      toast.error(friendlyError(result.error));
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/60 p-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Made it again?</span>{" "}
        {valid
          ? `Last made ${formatRelativeTime(lastCookedAt, locale)}`
          : "You've made this before"}
        {" · "}
        {cookedTimesLabel(cookCount).toLowerCase()}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onLogAgain}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <CookingPot className="size-4" />
        )}
        {pending ? "Logging…" : "Log again"}
      </Button>
    </div>
  );
}

function CookLogTimeline({
  entries,
  recipeSlug,
  canReact,
  reactionsByEntry,
}: {
  entries: CookLogItem[];
  recipeSlug: string;
  canReact: boolean;
  reactionsByEntry: Record<string, EntryReactions>;
}) {
  const locale = useLocale();
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-3 before:start-[1.15rem] before:top-3 before:w-px before:bg-border">
      {entries.map((entry) => {
        const cookedAt = new Date(entry.cookedAt);
        const valid = !Number.isNaN(cookedAt.getTime());
        const servings = formatServingsMade(entry.servingsMade);

        return (
          <li key={entry.id} className="relative flex gap-4">
            <div
              className="relative z-10 mt-1 flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
              aria-hidden="true"
            >
              <CookingPot className="size-4" />
            </div>

            <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <p className="font-medium leading-tight">
                    {valid ? formatDate(cookedAt, "PPP", locale) : "Logged earlier"}
                  </p>
                  {valid && (
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(cookedAt, locale)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {servings && (
                    <Badge variant="muted" className="gap-1">
                      <UtensilsCrossed className="size-3" aria-hidden="true" />
                      {servings}
                    </Badge>
                  )}
                  <DeleteCookButton
                    entryId={entry.id}
                    recipeSlug={recipeSlug}
                  />
                </div>
              </div>

              {entry.note && (
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {entry.note}
                </p>
              )}

              {entry.photoUrl && (
                <figure className="mt-3 overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- cook photos may be arbitrary user-pasted URLs (Cloudinary optional) that can't be pre-allowlisted for next/image */}
                  <img
                    src={entry.photoUrl}
                    alt={`Cooked on ${valid ? formatDate(cookedAt, "PPP", locale) : "an earlier date"}`}
                    className="max-h-72 w-full object-cover"
                  />
                </figure>
              )}

              <div className="mt-3">
                <ReactionBar
                  targetType="cook_log"
                  targetId={entry.id}
                  recipeSlug={recipeSlug}
                  initialCounts={reactionsByEntry[entry.id]?.counts ?? []}
                  initialReactors={reactionsByEntry[entry.id]?.reactors ?? {}}
                  canReact={canReact}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function LogCookButton({
  recipeId,
  recipeSlug,
  recipeTitle,
  canLog,
  shareGroup = null,
}: {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  canLog: boolean;
  shareGroup?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [photoUrl, setPhotoUrl] = React.useState("");
  const [servingsMade, setServingsMade] = React.useState("");
  const [shareWithFamily, setShareWithFamily] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setNote("");
    setPhotoUrl("");
    setServingsMade("");
    setShareWithFamily(false);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await logCookAction({
        recipeId,
        recipeSlug,
        note,
        photoUrl,
        servingsMade,
        shareWithFamily: shareGroup ? shareWithFamily : undefined,
      });
      if (result.ok) {
        toast.success(
          shareGroup && shareWithFamily
            ? `Logged and shared with ${shareGroup.name}`
            : "Logged to your journal",
        );
        reset();
        setOpen(false);
        router.refresh();
        return;
      }
      toast.error(friendlyError(result.error));
    });
  }

  if (!canLog) {
    return (
      <Button
        type="button"
        onClick={() => toast("Sign in to log a cook")}
      >
        <CookingPot /> I cooked this
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button">
          <CookingPot /> I cooked this
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CookingPot className="size-5" aria-hidden="true" />
            </div>
            <DialogTitle>Log a cook</DialogTitle>
            <DialogDescription>
              Add {recipeTitle} to your cooking journal. Jot down how it went and
              add a photo if you have one — it all becomes part of the story.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="cook-note">How did it go?</Label>
            <Textarea
              id="cook-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Doubled the garlic, baked 5 min longer, everyone went back for seconds…"
              disabled={pending}
            />
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Note any tweaks so next time is even better.
              </p>
              <CharacterCounter
                value={note.length}
                max={COOK_NOTE_MAX_LENGTH}
                overMessage={COOK_NOTE_TOO_LONG_MESSAGE}
              />
            </div>
          </div>

          <ImageUploadField
            value={photoUrl}
            onChange={setPhotoUrl}
            label="Photo (optional)"
            folder="heirloom/cooks"
            size="compact"
            hint="Add a snapshot of how yours turned out."
          />

          <div className="grid gap-2">
            <Label htmlFor="cook-servings">Servings made (optional)</Label>
            <Input
              id="cook-servings"
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              value={servingsMade}
              onChange={(event) => setServingsMade(event.target.value)}
              placeholder="e.g. 4"
              disabled={pending}
              className="max-w-32"
            />
          </div>

          {shareGroup && (
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/40 p-3">
              <div className="grid gap-0.5">
                <Label htmlFor="cook-share" className="cursor-pointer">
                  Share with my family
                </Label>
                <p className="text-xs text-muted-foreground">
                  Post this cook to {shareGroup.name}&apos;s activity feed and the
                  recipe&apos;s family photo strip.
                </p>
              </div>
              <Switch
                id="cook-share"
                checked={shareWithFamily}
                onCheckedChange={setShareWithFamily}
                disabled={pending}
                aria-label={`Share this cook with ${shareGroup.name}`}
              />
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              {pending ? "Saving…" : "Add to journal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCookButton({
  entryId,
  recipeSlug,
}: {
  entryId: string;
  recipeSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function onDelete() {
    if (
      !window.confirm(
        "Delete this cook from your journal? This can't be undone.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteCookLogAction({ entryId, recipeSlug });
      if (result.ok) {
        toast.success("Removed from your journal");
        router.refresh();
        return;
      }
      toast.error(friendlyError(result.error));
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground hover:text-destructive"
      onClick={onDelete}
      disabled={pending}
      aria-label="Delete this journal entry"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Trash2 className="size-4" />
      )}
    </Button>
  );
}
