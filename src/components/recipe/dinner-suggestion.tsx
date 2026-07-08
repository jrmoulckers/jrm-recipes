"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Check,
  ChefHat,
  Clock3,
  Shuffle,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";

import type { DinnerCandidate } from "~/server/recipes/queries";
import { addEntryAction } from "~/server/planner/actions";
import { cn, formatMinutes } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

/** Fisher–Yates shuffle of a fresh index array, so consecutive picks differ. */
function shuffledIndices(length: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * One-tap "what's for dinner tonight?" picker (#375). Removes decision fatigue:
 * one button surfaces a single dinner-appropriate recipe (already biased quick +
 * easy by the server) with Cook and Add-to-tonight's-plan actions, plus a
 * reshuffle. Falls back to a create/browse prompt when the library is empty.
 */
export function DinnerSuggestion({
  candidates,
  today,
}: {
  candidates: DinnerCandidate[];
  today: string;
}) {
  const router = useRouter();
  const [order, setOrder] = React.useState<number[]>([]);
  const [pos, setPos] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [planned, setPlanned] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const current =
    revealed && order.length > 0
      ? candidates[order[pos % order.length]!]
      : undefined;

  function pick() {
    setOrder(shuffledIndices(candidates.length));
    setPos(0);
    setPlanned(false);
    setRevealed(true);
  }

  function pickAgain() {
    setPos((p) => p + 1);
    setPlanned(false);
  }

  function addTonight() {
    if (!current || pending || planned) return;
    startTransition(async () => {
      const result = await addEntryAction({
        date: today,
        slot: "dinner",
        recipeId: current.id,
      });
      if (result.ok) {
        setPlanned(true);
        toast.success(`${current.title} is on tonight's plan.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="size-5 text-primary" />
          <h2 className="font-display text-xl font-bold tracking-tight">
            Tonight&apos;s dinner
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          No browsing, no deciding — let us pick one for you.
        </p>
      </div>

      {candidates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              Add a few recipes and we&apos;ll start suggesting dinners.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/recipes/new">
                  <ChefHat /> Add a recipe
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/recipes">Browse recipes</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : !current ? (
        <div>
          <Button size="xl" onClick={pick}>
            <Sparkles /> Pick my dinner
          </Button>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-col sm:flex-row">
            <Link
              href={`/recipes/${current.slug}`}
              className="relative block aspect-[16/10] w-full shrink-0 overflow-hidden sm:w-56"
            >
              {current.coverImageUrl ? (
                <Image
                  src={current.coverImageUrl}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 224px"
                  className="object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/25 to-accent/20">
                  <UtensilsCrossed className="size-10 text-foreground/25" />
                </div>
              )}
            </Link>
            <CardContent className="flex flex-1 flex-col gap-3 p-5">
              <div className="flex flex-col gap-1">
                <Link
                  href={`/recipes/${current.slug}`}
                  className="font-display text-lg font-semibold leading-tight hover:text-primary"
                >
                  {current.title}
                </Link>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {current.totalMinutes != null && (
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-3.5" />{" "}
                      {formatMinutes(current.totalMinutes)}
                    </span>
                  )}
                  {current.difficulty && (
                    <Badge variant="muted" className="capitalize">
                      {current.difficulty}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/recipes/${current.slug}/cook`}>
                    <ChefHat /> Cook
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={addTonight}
                  disabled={pending || planned}
                  aria-pressed={planned}
                >
                  {planned ? (
                    <>
                      <Check className={cn("text-primary")} /> On tonight&apos;s
                      plan
                    </>
                  ) : (
                    <>
                      <UtensilsCrossed /> Add to tonight&apos;s plan
                    </>
                  )}
                </Button>
                {candidates.length > 1 && (
                  <Button variant="ghost" onClick={pickAgain} disabled={pending}>
                    <Shuffle /> Not that — pick again
                  </Button>
                )}
              </div>
            </CardContent>
          </div>
        </Card>
      )}
    </section>
  );
}
