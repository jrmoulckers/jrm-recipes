import { type Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { getPlan } from "~/config/plans";
import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  getLimitStatus,
  getSubscriptionSnapshot,
} from "~/server/billing/entitlements";
import { isBillingConfigured } from "~/server/billing/stripe";
import { type SubscriptionStatus } from "~/server/db/schema";
import { formatDate } from "~/lib/dates";
import { Badge, type BadgeProps } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { UsageMeter } from "~/components/billing/usage-meter";
import { ManageBillingButton } from "~/components/billing/manage-billing-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("billing.title") };
}

/**
 * Badge tone for each synced Stripe status. The label itself is read from
 * `billing.settings.status.<status>` so it follows the reader's locale.
 */
const STATUS_VARIANT: Record<SubscriptionStatus, BadgeProps["variant"]> = {
  trialing: "success",
  active: "success",
  past_due: "warning",
  canceled: "secondary",
  incomplete: "warning",
};

/** MB → human copy, promoting to GB once we cross a gigabyte. */
function formatMb(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb.toLocaleString(undefined, {
      maximumFractionDigits: Number.isInteger(gb) ? 0 : 1,
    })} GB`;
  }
  return `${mb.toLocaleString()} MB`;
}

/**
 * Billing & plan settings surface (issue #319).
 *
 * The self-serve home for a family's subscription: current plan + status,
 * renewal/trial dates, live usage meters against each plan limit, and the entry
 * points to Stripe's Customer Portal (manage/cancel) or `/pricing` (upgrade).
 * Every dependency degrades gracefully. An unconfigured DB or Stripe, a
 * signed-out visitor, or a Free account each render a calm, explanatory state
 * rather than an error. All plan copy comes from `src/config/plans.ts`.
 */
export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const user = await getCurrentUser();
  const dbConfigured = isDbConfigured();

  if (isAuthConfigured() && dbConfigured && !user) return <SignInNudge />;

  const { checkout } = await searchParams;
  const billingReady = isBillingConfigured();

  const snapshot = user ? await getSubscriptionSnapshot(user) : null;
  const planId = snapshot?.planId ?? "free";
  const plan = getPlan(planId);
  const isPaid = planId !== "free";

  const meters = user
    ? await Promise.all([
        getLimitStatus(user, "maxRecipes", "recipes"),
        getLimitStatus(user, "maxStorageMb", "storage_mb"),
        getLimitStatus(user, "aiCreditsPerMonth", "ai_credits"),
      ])
    : null;
  const [recipes, storage, aiCredits] = meters ?? [null, null, null];

  const t = await getTranslations("billing.settings");
  const tPlan = await getTranslations("billing.plans");

  return (
    <div className="container flex max-w-3xl flex-col gap-8 py-10">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </header>

      {checkout === "success" ? (
        <p
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {t("checkoutSuccess", { plan: tPlan("family.name") })}
        </p>
      ) : null}

      {!dbConfigured ? <ConnectDbNotice /> : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-5 text-primary" aria-hidden="true" />
              {tPlan(`${plan.id}.name`)}
            </CardTitle>
            {snapshot ? (
              <Badge variant={STATUS_VARIANT[snapshot.status]}>
                {t(`status.${snapshot.status}`)}
              </Badge>
            ) : (
              <Badge variant="secondary">{t("freePlan")}</Badge>
            )}
          </div>
          <CardDescription>{tPlan(`${plan.id}.tagline`)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <p className="flex items-baseline gap-1">
            <span className="font-display text-2xl font-bold">
              ${plan.monthlyPriceUsd}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("perMonth")}
            </span>
          </p>

          {snapshot ? <RenewalNote snapshot={snapshot} /> : null}

          <div className="flex flex-wrap gap-3">
            {isPaid ? <ManageBillingButton /> : null}
            <Button asChild variant={isPaid ? "ghost" : "default"}>
              <Link href="/pricing">
                {isPaid
                  ? t("viewAllPlans")
                  : t("upgrade", { plan: tPlan("family.name") })}
              </Link>
            </Button>
          </div>

          {isPaid && !billingReady ? (
            <p className="text-sm text-muted-foreground">
              {t("billingUnavailable")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {recipes && storage && aiCredits ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("usage.title")}</CardTitle>
            <CardDescription>{t("usage.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <UsageMeter
              label={t("usage.recipes")}
              used={recipes.used}
              limit={recipes.limit}
              ratio={recipes.ratio}
              state={recipes.state}
            />
            <UsageMeter
              label={t("usage.storage")}
              used={storage.used}
              limit={storage.limit}
              ratio={storage.ratio}
              state={storage.state}
              format={formatMb}
            />
            <UsageMeter
              label={t("usage.aiCredits")}
              used={aiCredits.used}
              limit={aiCredits.limit}
              ratio={aiCredits.ratio}
              state={aiCredits.state}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

async function RenewalNote({
  snapshot,
}: {
  snapshot: NonNullable<Awaited<ReturnType<typeof getSubscriptionSnapshot>>>;
}) {
  const t = await getTranslations("billing.settings.renewal");
  const tPlan = await getTranslations("billing.plans");
  const locale = await getLocale();
  let text: string | null = null;
  if (snapshot.cancelAtPeriodEnd && snapshot.currentPeriodEnd) {
    text = t("ends", {
      date: formatDate(snapshot.currentPeriodEnd, "PPP", locale),
      plan: tPlan("family.name"),
    });
  } else if (snapshot.status === "trialing" && snapshot.trialEnd) {
    text = t("trialEnds", {
      date: formatDate(snapshot.trialEnd, "PPP", locale),
    });
  } else if (snapshot.currentPeriodEnd) {
    text = t("renews", {
      date: formatDate(snapshot.currentPeriodEnd, "PPP", locale),
    });
  }
  if (!text) return null;
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

async function SignInNudge() {
  const t = await getTranslations("billing.settings.signIn");
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <CreditCard className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("body")}</p>
        </div>
      </div>
    </div>
  );
}

async function ConnectDbNotice() {
  const t = await getTranslations("billing.settings");
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-6 text-center text-sm text-muted-foreground">
      <p className="mx-auto max-w-md">{t("notConfigured")}</p>
    </div>
  );
}
