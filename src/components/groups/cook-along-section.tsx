"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  CookingPot,
  HelpCircle,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  createCookAlongAction,
  rsvpCookAlongAction,
} from "~/server/cookalong/actions";
import type {
  PastCookAlongPrompt,
  UpcomingCookAlong,
} from "~/server/cookalong/queries";
import type { RsvpStatus } from "~/server/db/schema";
import { formatDate, formatRelativeTime } from "~/lib/dates";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

type GroupRecipeOption = { id: string; title: string };

/**
 * Cook-along scheduling + RSVP surface for a group page (issue #353). Members
 * can schedule a shared cook date, the family RSVPs, and everyone sees who's
 * coming. Recently-finished cook-alongs nudge attendees to log their cook.
 */
export function CookAlongSection({
  groupSlug,
  groupId,
  isMember,
  recipes,
  upcoming,
  toLog,
}: {
  groupSlug: string;
  groupId: string;
  isMember: boolean;
  recipes: GroupRecipeOption[];
  upcoming: UpcomingCookAlong[];
  toLog: PastCookAlongPrompt[];
}) {
  return (
    <section className="flex flex-col gap-4" aria-label="Cook-alongs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Cook-alongs
          </h2>
          <p className="mt-1 text-muted-foreground">
            Pick a night, make the same dish together — near or far.
          </p>
        </div>
        {isMember && recipes.length > 0 ? (
          <ScheduleCookAlongButton
            groupSlug={groupSlug}
            groupId={groupId}
            recipes={recipes}
          />
        ) : null}
      </div>

      {toLog.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {toLog.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
            >
              <div className="flex items-center gap-3">
                <CookingPot
                  className="size-5 text-primary"
                  aria-hidden="true"
                />
                <p className="text-sm">
                  How did{" "}
                  <span className="font-medium">
                    {event.title ?? event.recipe?.title ?? "your cook-along"}
                  </span>{" "}
                  go? Log your cook and rate it.
                </p>
              </div>
              {event.recipe ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/recipes/${event.recipe.slug}`}>
                    Log my cook
                  </Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {upcoming.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {upcoming.map((event) => (
            <CookAlongCard
              key={event.id}
              groupSlug={groupSlug}
              event={event}
              canRsvp={isMember}
            />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center text-sm text-muted-foreground">
          <CalendarClock
            className="mx-auto mb-2 size-6 text-muted-foreground"
            aria-hidden="true"
          />
          No cook-alongs on the calendar yet.
          {isMember && recipes.length > 0
            ? " Schedule one and rally the family."
            : ""}
        </div>
      )}
    </section>
  );
}

function initial(name: string | null, handle: string | null) {
  const source = name ?? handle ?? "?";
  return source.slice(0, 1).toUpperCase();
}

function CookAlongCard({
  groupSlug,
  event,
  canRsvp,
}: {
  groupSlug: string;
  event: UpcomingCookAlong;
  canRsvp: boolean;
}) {
  const going = event.attendees.filter((a) => a.status === "going");
  const hostName = event.host?.name ?? event.host?.handle ?? "A family cook";

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-token">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <CalendarClock className="size-4" aria-hidden="true" />
            {formatDate(event.scheduledFor, "EEE, MMM d · h:mm a")}
            <span className="text-muted-foreground">
              ({formatRelativeTime(event.scheduledFor)})
            </span>
          </div>
          <h3 className="mt-1 font-display text-lg font-semibold">
            {event.title ?? event.recipe?.title ?? "Cook-along"}
          </h3>
          {event.recipe ? (
            <p className="text-sm text-muted-foreground">
              Cooking{" "}
              <Link
                href={`/recipes/${event.recipe.slug}`}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                {event.recipe.title}
              </Link>{" "}
              · hosted by {hostName}
            </p>
          ) : null}
          {event.note ? (
            <p className="mt-2 text-sm text-muted-foreground">{event.note}</p>
          ) : null}
        </div>
        <Badge variant="secondary" className="shrink-0">
          {event.goingCount} going
        </Badge>
      </div>

      {going.length > 0 ? (
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {going.slice(0, 6).map((attendee) => (
              <Avatar
                key={attendee.userId}
                className="size-7 border-2 border-card"
              >
                {attendee.user?.avatarUrl ? (
                  <AvatarImage
                    src={attendee.user.avatarUrl}
                    alt={attendee.user.name ?? ""}
                  />
                ) : null}
                <AvatarFallback className="text-xs">
                  {initial(
                    attendee.user?.name ?? null,
                    attendee.user?.handle ?? null,
                  )}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          {going.length > 6 ? (
            <span className="text-xs text-muted-foreground">
              +{going.length - 6} more
            </span>
          ) : null}
        </div>
      ) : null}

      {canRsvp ? (
        <RsvpControls
          groupSlug={groupSlug}
          cookAlongId={event.id}
          current={event.viewerStatus}
        />
      ) : null}
    </li>
  );
}

const RSVP_OPTIONS: {
  status: RsvpStatus;
  label: string;
  Icon: typeof Check;
}[] = [
  { status: "going", label: "Going", Icon: Check },
  { status: "maybe", label: "Maybe", Icon: HelpCircle },
  { status: "declined", label: "Can't make it", Icon: X },
];

function RsvpControls({
  groupSlug,
  cookAlongId,
  current,
}: {
  groupSlug: string;
  cookAlongId: string;
  current: RsvpStatus | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [optimistic, setOptimistic] = React.useState<RsvpStatus | null>(
    current,
  );

  function respond(status: RsvpStatus) {
    setOptimistic(status);
    startTransition(async () => {
      const result = await rsvpCookAlongAction({
        groupSlug,
        cookAlongId,
        status,
      });
      if (result.ok) {
        router.refresh();
        return;
      }
      setOptimistic(current);
      toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Your RSVP:</span>
      {RSVP_OPTIONS.map(({ status, label, Icon }) => {
        const active = optimistic === status;
        return (
          <Button
            key={status}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            disabled={pending}
            onClick={() => respond(status)}
            aria-pressed={active}
          >
            <Icon />
            {label}
          </Button>
        );
      })}
    </div>
  );
}

function ScheduleCookAlongButton({
  groupSlug,
  groupId,
  recipes,
}: {
  groupSlug: string;
  groupId: string;
  recipes: GroupRecipeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [recipeId, setRecipeId] = React.useState(recipes[0]?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const [scheduledFor, setScheduledFor] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setRecipeId(recipes[0]?.id ?? "");
    setTitle("");
    setNote("");
    setScheduledFor("");
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!recipeId || !scheduledFor) {
      toast.error("Pick a recipe and a date.");
      return;
    }
    startTransition(async () => {
      const result = await createCookAlongAction({
        groupSlug,
        groupId,
        recipeId,
        title,
        note,
        scheduledFor: new Date(scheduledFor).toISOString(),
      });
      if (result.ok) {
        toast.success("Cook-along scheduled — the family's invited");
        reset();
        setOpen(false);
        router.refresh();
        return;
      }
      toast.error(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <CalendarPlus />
          Schedule a cook-along
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Schedule a cook-along</DialogTitle>
            <DialogDescription>
              Pick a recipe and a time, then invite the family to cook it
              together.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="cookalong-recipe">Recipe</Label>
            <select
              id="cookalong-recipe"
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              disabled={pending}
              className="flex h-[calc(2.5rem*var(--control-scale))] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cookalong-when">When</Label>
            <Input
              id="cookalong-when"
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cookalong-title">Title (optional)</Label>
            <Input
              id="cookalong-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Sunday gnocchi night"
              disabled={pending}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cookalong-note">Note (optional)</Label>
            <Textarea
              id="cookalong-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder="We'll start at 5. Bring your aprons!"
              disabled={pending}
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CalendarPlus />
              )}
              {pending ? "Scheduling…" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
