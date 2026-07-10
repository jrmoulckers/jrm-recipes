import { type Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";

import { getPlan } from "~/config/plans";
import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  getLimitStatus,
  getSubscriptionSnapshot,
} from "~/server/billing/entitlements";
import { isBillingConfigured } from "~/server/billing/stripe";
import { type SubscriptionStatus } from "~/server/db/schema";
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

export const metadata: Metadata = { title: "Billing & plan" };

/** Friendly label + badge tone for each synced Stripe status. */
const STATUS_META: Record<
  SubscriptionStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  trialing: { label: "Free trial", variant: "success" },
  active: { label: "Active", variant: "success" },
  past_due: { label: "Payment past due", variant: "warning" },
  canceled: { label: "Canceled", variant: "secondary" },
  incomplete: { label: "Incomplete", variant: "warning" },
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(date);
}

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
 * Every dependency degrades gracefully — an unconfigured DB or Stripe, a
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

  const status = snapshot ? STATUS_META[snapshot.status] : null;

  return (
    <div className="container flex max-w-3xl flex-col gap-8 py-10">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Billing &amp; plan
        </h1>
        <p className="mt-1 text-muted-foreground">
          See your plan, track how much you&apos;ve used, and manage billing —
          all in one place.
        </p>
      </header>

      {checkout === "success" ? (
        <p
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          You&apos;re all set — welcome to {getPlan("family").name}! It may take
          a moment for your new plan to appear below.
        </p>
      ) : null}

      {!dbConfigured ? <ConnectDbNotice /> : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-5 text-primary" aria-hidden="true" />
              {plan.name}
            </CardTitle>
            {status ? (
              <Badge variant={status.variant}>{status.label}</Badge>
            ) : (
              <Badge variant="secondary">Free plan</Badge>
            )}
          </div>
          <CardDescription>{plan.tagline}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <p className="flex items-baseline gap-1">
            <span className="font-display text-2xl font-bold">
              ${plan.monthlyPriceUsd}
            </span>
            <span className="text-sm text-muted-foreground">/ month</span>
          </p>

          {snapshot ? <RenewalNote snapshot={snapshot} /> : null}

          <div className="flex flex-wrap gap-3">
            {isPaid ? <ManageBillingButton /> : null}
            <Button asChild variant={isPaid ? "ghost" : "default"}>
              <Link href="/pricing">
                {isPaid ? "View all plans" : "Upgrade to Family"}
              </Link>
            </Button>
          </div>

          {isPaid && !billingReady ? (
            <p className="text-sm text-muted-foreground">
              Billing management is unavailable in this environment.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {recipes && storage && aiCredits ? (
        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>
              How much of your plan you&apos;ve used this period.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <UsageMeter
              label="Recipes"
              used={recipes.used}
              limit={recipes.limit}
              ratio={recipes.ratio}
              state={recipes.state}
            />
            <UsageMeter
              label="Photo & video storage"
              used={storage.used}
              limit={storage.limit}
              ratio={storage.ratio}
              state={storage.state}
              format={formatMb}
            />
            <UsageMeter
              label="AI credits"
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

function RenewalNote({
  snapshot,
}: {
  snapshot: NonNullable<Awaited<ReturnType<typeof getSubscriptionSnapshot>>>;
}) {
  let text: string | null = null;
  if (snapshot.cancelAtPeriodEnd && snapshot.currentPeriodEnd) {
    text = `Your plan ends on ${formatDate(snapshot.currentPeriodEnd)}. You'll keep Family until then.`;
  } else if (snapshot.status === "trialing" && snapshot.trialEnd) {
    text = `Your free trial ends on ${formatDate(snapshot.trialEnd)}.`;
  } else if (snapshot.currentPeriodEnd) {
    text = `Renews on ${formatDate(snapshot.currentPeriodEnd)}.`;
  }
  if (!text) return null;
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function SignInNudge() {
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <CreditCard className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Your billing is private
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in from the header to see your plan and manage billing.
          </p>
        </div>
      </div>
    </div>
  );
}

function ConnectDbNotice() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-6 text-center text-sm text-muted-foreground">
      <p className="mx-auto max-w-md">
        Billing isn&apos;t set up in this environment yet. You can preview the
        plans below, but subscriptions aren&apos;t available until a database
        and Stripe are configured.
      </p>
    </div>
  );
}
