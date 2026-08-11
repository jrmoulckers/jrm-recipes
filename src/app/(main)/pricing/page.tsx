import { type Metadata } from 'next';
import Link from 'next/link';
import { Check, Gift } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { PLAN_LIST, GIFT_CONFIG, getPlan, type Plan } from '~/config/plans';
import { brand } from '~/config/brand';
import { getCurrentUser } from '~/server/auth';
import { getEffectivePlanId } from '~/server/billing/entitlements';
import { isBillingConfigured } from '~/server/billing/stripe';
import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { CheckoutButton } from '~/components/billing/checkout-button';
import { GiftButton } from '~/components/billing/gift-button';
import { withRouteMessages } from '~/components/i18n/route-messages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: t('pricing.title'),
    description: t('pricing.description'),
  };
}

/**
 * Which bullet points each plan shows, in order. The ids are structural. Their
 * text lives in `billing.plans.<planId>.highlights.<id>` so the pitch is
 * translated like the rest of the page.
 */
const PLAN_HIGHLIGHTS: Record<Plan['id'], readonly string[]> = {
  free: ['recipes', 'group', 'storage', 'tools'],
  family: ['recipes', 'members', 'storage', 'ai', 'video', 'credits'],
};

/**
 * Public pricing page (issue #312).
 *
 * Renders every plan straight from `src/config/plans.ts` (the single source of
 * truth for ids, prices, trials, and entitlements) with its display copy read
 * from the `billing.plans` catalog, highlights the signed-in user's current
 * plan via the entitlements resolver, and routes each paid CTA through the
 * checkout action. When billing is unconfigured the page stays fully viewable:
 * the paid CTA is disabled with a friendly note. Warm, honest tone. No fake
 * scarcity or countdowns.
 */
async function PricingPage() {
  const user = await getCurrentUser();
  const currentPlanId = user ? await getEffectivePlanId(user) : null;
  const billingReady = isBillingConfigured();
  const t = await getTranslations('billing.pricing');

  return (
    <div className="container flex flex-col gap-10 py-12">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight">{t('heading')}</h1>
        <p className="mt-3 text-muted-foreground">{t('subheading')}</p>
      </header>

      {!billingReady ? (
        <p className="mx-auto max-w-xl rounded-xl border border-dashed border-border bg-surface/50 px-4 py-3 text-center text-sm text-muted-foreground">
          {t('checkoutDisabled')}
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
 * hiding in a plan CTA. Buying routes through the one-time gift Checkout. A
 * quiet link points recipients at `/redeem`. Degrades to a disabled note when
 * billing is unconfigured, exactly like the paid CTAs above.
 */
async function GiftSection({ billingReady }: { billingReady: boolean }) {
  const t = await getTranslations('billing.pricing.gift');
  const tPlan = await getTranslations('billing.plans');
  const family = getPlan(GIFT_CONFIG.planId);
  const label = t('cta', { months: GIFT_CONFIG.durationMonths });

  return (
    <Card className="mx-auto w-full max-w-4xl border-primary/30 bg-surface/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gift className="size-5 text-primary" aria-hidden="true" />
          <CardTitle>{t('title', { brand: brand.name })}</CardTitle>
        </div>
        <CardDescription>
          {t('description', {
            months: GIFT_CONFIG.durationMonths,
            plan: tPlan(`${family.id}.name`),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:max-w-xs">
          {billingReady ? (
            <GiftButton>{label}</GiftButton>
          ) : (
            <Button className="w-full" disabled>
              {label}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t.rich('haveCode', {
            link: (chunks) => (
              <Link
                href="/redeem"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </CardContent>
    </Card>
  );
}

async function PlanCard({
  plan,
  isCurrent,
  billingReady,
}: {
  plan: Plan;
  isCurrent: boolean;
  billingReady: boolean;
}) {
  const t = await getTranslations('billing.pricing');
  const tPlan = await getTranslations('billing.plans');
  const isPaid = plan.monthlyPriceUsd > 0;

  return (
    <Card className={cn('flex flex-col', isPaid && 'border-primary/40 shadow-token-lg')}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{tPlan(`${plan.id}.name`)}</CardTitle>
          {isCurrent ? (
            <Badge variant="success">{t('currentPlan')}</Badge>
          ) : isPaid ? (
            <Badge>{t('mostPopular')}</Badge>
          ) : null}
        </div>
        <CardDescription>{tPlan(`${plan.id}.tagline`)}</CardDescription>
        <p className="mt-2 flex items-baseline gap-1">
          <span className="font-display text-3xl font-bold">${plan.monthlyPriceUsd}</span>
          <span className="text-sm text-muted-foreground">{t('perMonth')}</span>
        </p>
        {plan.trialDays > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('trialNote', {
              days: plan.trialDays,
              price: plan.monthlyPriceUsd,
            })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <ul className="flex flex-col gap-2 text-sm">
          {PLAN_HIGHLIGHTS[plan.id].map((highlight) => (
            <li key={highlight} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{tPlan(`${plan.id}.highlights.${highlight}`)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto">
          <PlanCta plan={plan} isCurrent={isCurrent} isPaid={isPaid} billingReady={billingReady} />
        </div>
      </CardContent>
    </Card>
  );
}

async function PlanCta({
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
  const t = await getTranslations('billing.pricing');
  const tPlan = await getTranslations('billing.plans');

  if (isCurrent) {
    return (
      <Button variant="outline" className="w-full" disabled>
        {t('currentPlan')}
      </Button>
    );
  }

  if (!isPaid) {
    return (
      <Button asChild variant="outline" className="w-full">
        <Link href="/recipes/new">{t('freeCta')}</Link>
      </Button>
    );
  }

  const label =
    plan.trialDays > 0
      ? t('trialCta', {
          days: plan.trialDays,
          plan: tPlan(`${plan.id}.name`),
        })
      : t('upgradeCta', { plan: tPlan(`${plan.id}.name`) });

  if (!billingReady) {
    return (
      <Button className="w-full" disabled>
        {label}
      </Button>
    );
  }

  return <CheckoutButton planId={plan.id}>{label}</CheckoutButton>;
}

export default withRouteMessages(PricingPage);
