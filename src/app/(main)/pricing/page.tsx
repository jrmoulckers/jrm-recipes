import { type Metadata } from "next";
import Link from "next/link";
import { Check, Gift } from "lucide-react";

import { PLAN_LIST, GIFT_CONFIG, getPlan, type Plan } from "~/config/plans";
import { getCurrentUser } from "~/server/auth";
import { getEffectivePlanId } from "~/server/billing/entitlements";
import { isBillingConfigured } from "~/server/billing/stripe";
import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { CheckoutButton } from "~/components/billing/checkout-button";
import { GiftButton } from "~/components/billing/gift-button";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, honest pricing for Heirloom. Start free, upgrade to Family for unlimited recipes and AI help — cancel anytime.",
};

/**
 * Public pricing page (issue #312).
 *
 * Renders every plan straight from `src/config/plans.ts` (the single source of
 * truth — no duplicated marketing copy), highlights the signed-in user's current
 * plan via the entitlements resolver, and routes each paid CTA through the
 * checkout action. When billing is unconfigured the page stays fully viewable:
 * the paid CTA is disabled with a friendly note. Warm, honest tone — no fake
 * scarcity or countdowns.
 */
export default async function PricingPage() {
  const user = await getCurrentUser();
  const currentPlanId = user ? await getEffectivePlanId(user) : null;
  const billingReady = isBillingConfigured();

  return (
    <div className="container flex flex-col gap-10 py-12">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight">
          Simple pricing for every family
        </h1>
        <p className="mt-3 text-muted-foreground">
          Start free and keep everything you cook. Upgrade to Family when
          you&apos;re ready for unlimited recipes and AI help — no fine print, no
          countdowns, cancel anytime.
        </p>
      </header>

      {!billingReady ? (
        <p className="mx-auto max-w-xl rounded-xl border border-dashed border-border bg-surface/50 px-4 py-3 text-center text-sm text-muted-foreground">
          Checkout isn&apos;t enabled in this environment yet, so you can compare
          the plans here but can&apos;t subscribe right now.
        </p>
      ) : null}

      <div className="mx-auto grid w-full max-w-4xl gap-6 sm:grid-cols-2">
        {PLAN_LIST.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={currentPlanId === plan.id}
            billingReady={billingReady}
          />
        ))}
      </div>

      <GiftSection billingReady={billingReady} />
    </div>
  );
}

/**
 * "Gift Heirloom" entry (issue #331). Gifting a year of Family is deeply
 * on-brand for a family recipe app, so it gets its own warm card rather than
 * hiding in a plan CTA. Buying routes through the one-time gift Checkout; a
 * quiet link points recipients at `/redeem`. Degrades to a disabled note when
 * billing is unconfigured, exactly like the paid CTAs above.
 */
function GiftSection({ billingReady }: { billingReady: boolean }) {
  const family = getPlan(GIFT_CONFIG.planId);

  return (
    <Card className="mx-auto w-full max-w-4xl border-primary/30 bg-surface/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gift className="size-5 text-primary" aria-hidden="true" />
          <CardTitle>Gift Heirloom</CardTitle>
        </div>
        <CardDescription>
          Give someone {GIFT_CONFIG.durationMonths} months of {family.name} — a
          warm way to help a loved one keep every family recipe safe. One
          payment, no subscription, delivered as a code they redeem.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:max-w-xs">
          {billingReady ? (
            <GiftButton>Gift {GIFT_CONFIG.durationMonths} months</GiftButton>
          ) : (
            <Button className="w-full" disabled>
              Gift {GIFT_CONFIG.durationMonths} months
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Have a code?{" "}
          <Link href="/redeem" className="font-medium text-primary underline-offset-4 hover:underline">
            Redeem your gift
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

function PlanCard({
  plan,
  isCurrent,
  billingReady,
}: {
  plan: Plan;
  isCurrent: boolean;
  billingReady: boolean;
}) {
  const isPaid = plan.monthlyPriceUsd > 0;

  return (
    <Card
      className={cn(
        "flex flex-col",
        isPaid && "border-primary/40 shadow-token-lg",
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{plan.name}</CardTitle>
          {isCurrent ? (
            <Badge variant="success">Current plan</Badge>
          ) : isPaid ? (
            <Badge>Most popular</Badge>
          ) : null}
        </div>
        <CardDescription>{plan.tagline}</CardDescription>
        <p className="mt-2 flex items-baseline gap-1">
          <span className="font-display text-3xl font-bold">
            ${plan.monthlyPriceUsd}
          </span>
          <span className="text-sm text-muted-foreground">/ month</span>
        </p>
        {plan.trialDays > 0 ? (
          <p className="text-sm text-muted-foreground">
            {plan.trialDays}-day free trial, then ${plan.monthlyPriceUsd}/month
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <ul className="flex flex-col gap-2 text-sm">
          {plan.highlights.map((highlight) => (
            <li key={highlight} className="flex items-start gap-2">
              <Check
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto">
          <PlanCta
            plan={plan}
            isCurrent={isCurrent}
            isPaid={isPaid}
            billingReady={billingReady}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PlanCta({
  plan,
  isCurrent,
  isPaid,
  billingReady,
}: {
  plan: Plan;
  isCurrent: boolean;
  isPaid: boolean;
  billingReady: boolean;
}) {
  if (isCurrent) {
    return (
      <Button variant="outline" className="w-full" disabled>
        Current plan
      </Button>
    );
  }

  if (!isPaid) {
    return (
      <Button asChild variant="outline" className="w-full">
        <Link href="/recipes/new">Get started</Link>
      </Button>
    );
  }

  const label =
    plan.trialDays > 0
      ? `Start ${plan.trialDays}-day free trial`
      : `Upgrade to ${plan.name}`;

  if (!billingReady) {
    return (
      <Button className="w-full" disabled>
        {label}
      </Button>
    );
  }

  return <CheckoutButton planId={plan.id}>{label}</CheckoutButton>;
}
