import { type Metadata } from "next";
import { Gift } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { RedeemForm } from "~/components/billing/redeem-form";
import { withRouteMessages } from "~/components/i18n/route-messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("redeem.title"),
    description: t("redeem.description"),
  };
}

/**
 * Gift redemption page (issue #331).
 *
 * The recipient's landing spot: enter a code to unlock Family. Redemption is
 * DB-only (no Stripe), so this page works wherever the database is reachable,
 * and every dependency degrades gracefully. A signed-out visitor or an
 * unconfigured DB each render a calm, explanatory state rather than an error.
 * A `?gift=purchased` return from the gift Checkout shows a warm buyer thank-you.
 * a `?code=` param pre-fills the field for share links.
 */
async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ gift?: string; code?: string }>;
}) {
  const user = await getCurrentUser();
  const dbConfigured = isDbConfigured();

  if (isAuthConfigured() && dbConfigured && !user) return <SignInNudge />;

  const { gift, code } = await searchParams;
  const t = await getTranslations("billing.redeemPage");

  return (
    <div className="container flex max-w-lg flex-col gap-8 py-12">
      <header className="text-center">
        <span className="bg-primary/12 mx-auto inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <Gift className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </header>

      {gift === "purchased" ? (
        <p
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-center text-sm text-success"
        >
          {t("purchased")}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("form.title")}</CardTitle>
          <CardDescription>
            {t.rich("form.description", {
              code: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dbConfigured ? (
            <RedeemForm initialCode={code ?? ""} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function SignInNudge() {
  const t = await getTranslations("billing.redeemPage.signIn");
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <Gift className="size-7" aria-hidden="true" />
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

export default withRouteMessages(RedeemPage);
