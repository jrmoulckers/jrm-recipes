import * as React from "react";
import Link from "next/link";
import {
  BookHeart,
  ChefHat,
  Clock3,
  Import,
  Palette,
  Printer,
  Share2,
  Sparkles,
  Timer,
  Users,
  Wand2,
} from "lucide-react";

import { brand } from "~/config/brand";
import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import type { User } from "~/server/db/schema";
import {
  listBackInRotation,
  ROTATION_MIN,
} from "~/server/collections/queries";
import { listDinnerCandidates } from "~/server/recipes/queries";
import { buildQuickPlanContext } from "~/server/planner/quick-plan";
import { todayParam } from "~/server/planner/week";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { ModePicker } from "~/components/theme/mode-picker";
import { DinnerSuggestion } from "~/components/recipe/dinner-suggestion";
import { RotationRail } from "~/components/recipe/rotation-rail";
import { LandingViewedTracker } from "~/components/analytics/landing-viewed";

const features = [
  {
    icon: ChefHat,
    title: "Ridiculously easy to write",
    body: "A structured editor that turns a scribbled idea into a beautiful recipe in minutes — ingredients, steps, photos and all.",
  },
  {
    icon: Timer,
    title: "Cook mode that cooks with you",
    body: "Step-by-step, hands-free, with built-in timers, serving scaling and unit conversion. Works offline in the kitchen.",
  },
  {
    icon: BookHeart,
    title: "A living family history",
    body: "Track how a dish evolved across generations with timelines and adaptations. Nothing gets lost.",
    soon: true,
  },
  {
    icon: Share2,
    title: "Share & collaborate",
    body: "Invite family to a group cookbook. Rate, comment, and suggest tweaks together.",
  },
  {
    icon: Printer,
    title: "Print any way you like",
    body: "Recipe card, full page, or compact — export and print in the format that suits the moment.",
  },
  {
    icon: Import,
    title: "Import from anywhere",
    body: "Pull recipes from websites and social posts, then make them your own.",
    soon: true,
  },
];

/**
 * Personalized home data for signed-in users with a database (#426): the "back
 * in the rotation" favorites plus the quick-plan context their Add-to-plan
 * actions need. Kept in one round of queries so the marketing page stays fast
 * for everyone else.
 */
async function loadPersonalizedHome(user: User) {
  const today = todayParam();
  const [dinner, rotation, quickPlan] = await Promise.all([
    listDinnerCandidates(user, { today }),
    listBackInRotation(user.id),
    buildQuickPlanContext(user.id),
  ]);
  return { today, dinner, rotation, quickPlan };
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const personalized =
    user && isDbConfigured() ? await loadPersonalizedHome(user) : null;
  const showDinner = personalized != null && personalized.dinner.length > 0;
  const showRotation =
    personalized != null && personalized.rotation.length >= ROTATION_MIN;

  return (
    <div className="flex flex-col">
      <LandingViewedTracker />
      {personalized && (showDinner || showRotation) && (
        <section className="border-b border-border bg-surface">
          <div className="container flex flex-col gap-10 py-10">
            {showDinner && (
              <DinnerSuggestion
                candidates={personalized.dinner}
                today={personalized.today}
              />
            )}
            {showRotation && (
              <RotationRail
                recipes={personalized.rotation}
                quickPlan={personalized.quickPlan}
              />
            )}
          </div>
        </section>
      )}
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/0.12),transparent),radial-gradient(40%_50%_at_100%_10%,hsl(var(--accent)/0.12),transparent)]"
        />
        <div className="container flex flex-col items-center gap-6 py-16 text-center sm:py-24">
          <Badge variant="accent" className="gap-1.5">
            <Sparkles className="size-3.5" />
            Family recipes, reimagined
          </Badge>
          <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Every recipe your family loves,{" "}
            <span className="text-primary">kept alive</span> and easy to cook.
          </h1>
          <p className="max-w-xl text-pretty text-lg text-muted-foreground">
            {brand.name} is the cutest, easiest way to write, cook, share and
            pass down recipes — from your kitchen to the whole family.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="xl">
              <Link href="/recipes/new">
                <ChefHat /> Start your cookbook
              </Link>
            </Button>
            <Button asChild size="xl" variant="outline">
              <Link href="/recipes">Browse recipes</Link>
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-4" /> Offline cook mode
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" /> Family groups
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Wand2 className="size-4" /> Kids & accessibility modes
            </span>
          </div>
        </div>
      </section>

      {/* Make it yours — live theme showcase */}
      <section className="border-y border-border bg-surface">
        <div className="container py-14">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <Badge className="gap-1.5">
              <Palette className="size-3.5" /> Make it yours
            </Badge>
            <h2 className="font-display text-3xl font-bold tracking-tight">
              Five looks. One tap. Try them now.
            </h2>
            <p className="max-w-xl text-muted-foreground">
              Kitchen warmth, playful whimsy, clean professional, big-and-bright
              kids, or dead-simple — each with light and dark. Pick one and watch
              the whole app transform.
            </p>
          </div>
          <ModePicker />
        </div>
      </section>

      {/* Features */}
      <section className="container py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} interactive className="h-full">
              <CardContent className="flex flex-col gap-3 p-6">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <f.icon className="size-5" />
                </span>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-semibold">
                    {f.title}
                  </h3>
                  {f.soon && (
                    <Badge variant="muted" className="text-[0.65rem]">
                      Soon
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="container pb-20">
        <Card className="overflow-hidden border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-5 p-10 text-center">
            <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight">
              Start with one recipe. Build a legacy.
            </h2>
            <p className="max-w-lg text-muted-foreground">
              Write down the dish you make from memory — the one everyone asks
              for. {brand.name} makes it beautiful and keeps it forever.
            </p>
            <Button asChild size="xl">
              <Link href="/recipes/new">
                <ChefHat /> Create your first recipe
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
