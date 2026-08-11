import * as React from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  BookHeart,
  ChefHat,
  Clock3,
  Compass,
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
import { listBackInRotation, ROTATION_MIN } from "~/server/collections/queries";
import { listDinnerCandidates, listLibrary } from "~/server/recipes/queries";
import { listMyGroups } from "~/server/groups/queries";
import { getPersonalActivity } from "~/server/activity/queries";
import { getFollowingActivity } from "~/server/follows/queries";
import {
  getOnboardingProgress,
  isOnboardingComplete,
} from "~/server/onboarding/progress";
import { buildQuickPlanContext } from "~/server/planner/quick-plan";
import { todayParam } from "~/server/planner/week";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { ModePicker } from "~/components/theme/mode-picker";
import { DinnerSuggestion } from "~/components/recipe/dinner-suggestion";
import { RotationRail } from "~/components/recipe/rotation-rail";
import { RecipeCard } from "~/components/recipe/recipe-card";
import { ActivityFeedLazy } from "~/components/groups/activity-feed-lazy";
import { OnboardingChecklist } from "~/components/onboarding/onboarding-checklist";
import { LandingViewedTracker } from "~/components/analytics/landing-viewed";
import { WaitlistForm } from "~/components/marketing/waitlist-form";
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "~/lib/site-seo";
import { serializeJsonLd } from "~/lib/recipe-seo";
import { withRouteMessages } from "~/components/i18n/route-messages";

/**
 * Landing feature grid. Only the icon and the "coming soon" flag are structural.
 * The title and body for each entry live in `home.features.<id>` so the whole
 * marketing pitch is translated with the rest of the page.
 */
const features = [
  { id: "editor", icon: ChefHat },
  { id: "cookMode", icon: Timer },
  { id: "history", icon: BookHeart, soon: true },
  { id: "share", icon: Share2 },
  { id: "print", icon: Printer },
  { id: "import", icon: Import, soon: true },
] as const;

/**
 * Personalized home data for signed-in users with a database (#426): the "back
 * in the rotation" favorites plus the quick-plan context their Add-to-plan
 * actions need. Kept in one round of queries so the marketing page stays fast
 * for everyone else.
 */
async function loadPersonalizedHome(user: User) {
  const today = todayParam();
  const [dinner, rotation, quickPlan, library, myGroups, activity, following] =
    await Promise.all([
      listDinnerCandidates(user, { today }),
      listBackInRotation(user.id),
      buildQuickPlanContext(user.id),
      listLibrary(user).then((page) => page.items),
      listMyGroups(user.id),
      getPersonalActivity(user.id),
      getFollowingActivity(user.id),
    ]);
  return {
    today,
    dinner,
    rotation,
    quickPlan,
    library,
    hasGroups: myGroups.length > 0,
    activity,
    following,
  };
}

async function HomePage() {
  const user = await getCurrentUser();
  const [personalized, onboarding] =
    user && isDbConfigured()
      ? await Promise.all([
          loadPersonalizedHome(user),
          getOnboardingProgress(user),
        ])
      : [null, null];
  const showOnboarding =
    onboarding != null && !isOnboardingComplete(onboarding);
  const showDinner = personalized != null && personalized.dinner.length > 0;
  const showRotation =
    personalized != null && personalized.rotation.length >= ROTATION_MIN;
  // Signed-in users who already have recipes get a personalized home instead of
  // the marketing landing (#77): a greeting, quick actions, and their library.
  const personalizedHome =
    personalized != null && personalized.library.length > 0;
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const t = await getTranslations("home");
  const tNav = await getTranslations("nav");
  const tAuth = await getTranslations("auth");
  const greeting = firstName
    ? t("greeting.named", { name: firstName })
    : t("greeting.generic");

  return (
    <div className="flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildWebSiteJsonLd()),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildOrganizationJsonLd()),
        }}
      />
      <LandingViewedTracker />
      {showOnboarding && onboarding && (
        <section className="container pt-8">
          <OnboardingChecklist progress={onboarding} />
        </section>
      )}
      {personalizedHome && (
        <section className="border-b border-border bg-surface">
          <div className="container flex flex-col gap-5 py-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  {greeting}
                </h1>
                <p className="mt-1 text-muted-foreground">
                  {t("greeting.body")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/recipes/new">
                    <ChefHat /> {tNav("newRecipe")}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/recipes">
                    <BookHeart /> {t("actions.browse")}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/groups">
                    <Users /> {tNav("family")}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}
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
      {personalizedHome && personalized && (
        <section className="container py-12">
          <div className="mb-5 flex items-end justify-between gap-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">
              {t("yourRecipes")}
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/recipes">{t("viewAll")}</Link>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {personalized.library.slice(0, 8).map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </section>
      )}
      {personalized && (personalized.hasGroups || personalizedHome) && (
        <section className="container py-12">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                {t("activity.heading")}
              </h2>
              <p className="mt-1 text-muted-foreground">{t("activity.body")}</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/groups">{t("activity.yourFamilies")}</Link>
            </Button>
          </div>
          <div className="max-w-2xl">
            <ActivityFeedLazy
              source={{ kind: "personal" }}
              initialEvents={personalized.activity.events}
              initialCursor={personalized.activity.nextCursor}
              emptyState={
                personalized.hasGroups ? undefined : <FamilyFeedEmptyNudge />
              }
            />
          </div>
        </section>
      )}
      {personalized && personalized.following.events.length > 0 && (
        <section className="container py-12">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                {t("following.heading")}
              </h2>
              <p className="mt-1 text-muted-foreground">
                {t("following.body")}
              </p>
            </div>
          </div>
          <div className="max-w-2xl">
            <ActivityFeedLazy
              source={{ kind: "following" }}
              initialEvents={personalized.following.events}
              initialCursor={personalized.following.nextCursor}
            />
          </div>
        </section>
      )}
      {!personalizedHome && (
        <>
          {/* Hero */}
          <section className="relative overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/0.12),transparent),radial-gradient(40%_50%_at_100%_10%,hsl(var(--accent)/0.12),transparent)]"
            />
            <div className="container flex flex-col items-center gap-6 py-16 text-center sm:py-24">
              <Badge variant="accent" className="gap-1.5">
                <Sparkles className="size-3.5" />
                {t("hero.badge")}
              </Badge>
              <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
                {t.rich("hero.heading", {
                  highlight: (chunks) => (
                    <span className="text-primary">{chunks}</span>
                  ),
                })}
              </h1>
              <p className="max-w-xl text-pretty text-lg text-muted-foreground">
                {t("hero.body", { brand: brand.name })}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="xl">
                  <Link href="/recipes/new">
                    <ChefHat /> {tAuth("startCookbook")}
                  </Link>
                </Button>
                <Button asChild size="xl" variant="outline">
                  <Link href="/discover">
                    <Compass /> {t("hero.discover")}
                  </Link>
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-4" /> {t("hero.offlineCookMode")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-4" /> {t("hero.familyGroups")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Wand2 className="size-4" /> {t("hero.kidsModes")}
                </span>
              </div>
            </div>
          </section>

          {/* Make it yours. Live theme showcase */}
          <section className="border-y border-border bg-surface">
            <div className="container py-14">
              <div className="mb-8 flex flex-col items-center gap-3 text-center">
                <Badge className="gap-1.5">
                  <Palette className="size-3.5" /> {t("themes.badge")}
                </Badge>
                <h2 className="font-display text-3xl font-bold tracking-tight">
                  {t("themes.heading")}
                </h2>
                <p className="max-w-xl text-muted-foreground">
                  {t("themes.body")}
                </p>
              </div>
              <ModePicker />
            </div>
          </section>

          {/* Features */}
          <section className="container py-16">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <Card key={f.id} interactive className="h-full">
                  <CardContent className="flex flex-col gap-3 p-6">
                    <span className="bg-primary/12 inline-flex size-11 items-center justify-center rounded-xl text-primary">
                      <f.icon className="size-5" />
                    </span>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg font-semibold">
                        {t(`features.${f.id}.title`)}
                      </h3>
                      {"soon" in f && f.soon && (
                        <Badge variant="muted" className="text-[0.65rem]">
                          {t("soon")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t(`features.${f.id}.body`)}
                    </p>
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
                  {t("closing.heading")}
                </h2>
                <p className="max-w-lg text-muted-foreground">
                  {t("closing.body", { brand: brand.name })}
                </p>
                <Button asChild size="xl">
                  <Link href="/recipes/new">
                    <ChefHat /> {t("closing.cta")}
                  </Link>
                </Button>
                <div className="mt-2 w-full max-w-md">
                  <p className="mb-3 text-sm text-muted-foreground">
                    {t("closing.waitlist")}
                  </p>
                  <WaitlistForm source="closing" />
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Empty state for the personal home feed when the viewer belongs to no group
 * yet: a warm nudge toward the app's default social surface (family groups)
 * rather than a dead end.
 */
async function FamilyFeedEmptyNudge() {
  const t = await getTranslations("home.emptyFamily");
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
      <Users className="mx-auto mb-2 size-6" aria-hidden="true" />
      <p className="font-medium text-foreground">{t("title")}</p>
      <p className="mt-1 text-sm">{t("body")}</p>
      <Button asChild size="sm" className="mt-4">
        <Link href="/groups">
          <Users /> {t("cta")}
        </Link>
      </Button>
    </div>
  );
}

export default withRouteMessages(HomePage);
