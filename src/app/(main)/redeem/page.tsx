import { type Metadata } from "next";
import { Gift } from "lucide-react";

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

export const metadata: Metadata = {
  title: "Redeem a gift",
  description:
    "Have a Heirloom gift code? Redeem it here to unlock Family — unlimited recipes, AI help, and space for the whole family.",
};

/**
 * Gift redemption page (issue #331).
 *
 * The recipient's landing spot: enter a code to unlock Family. Redemption is
 * DB-only (no Stripe), so this page works wherever the database is reachable,
 * and every dependency degrades gracefully — a signed-out visitor or an
 * unconfigured DB each render a calm, explanatory state rather than an error.
 * A `?gift=purchased` return from the gift Checkout shows a warm buyer thank-you;
 * a `?code=` param pre-fills the field for share links.
 */
export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ gift?: string; code?: string }>;
}) {
  const user = await getCurrentUser();
  const dbConfigured = isDbConfigured();

  if (isAuthConfigured() && dbConfigured && !user) return <SignInNudge />;

  const { gift, code } = await searchParams;

  return (
    <div className="container flex max-w-lg flex-col gap-8 py-12">
      <header className="text-center">
        <span className="mx-auto inline-flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Gift className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">
          Redeem your gift
        </h1>
        <p className="mt-2 text-muted-foreground">
          Someone wants your recipes to live on. Enter your code to unlock
          Heirloom Family.
        </p>
      </header>

      {gift === "purchased" ? (
        <p
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-center text-sm text-success"
        >
          Thank you for gifting Heirloom! Your code is on its way — share it with
          someone you love, or redeem it below.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Enter your gift code</CardTitle>
          <CardDescription>
            Codes look like <span className="font-mono">GIFT-XXXX-XXXX-XXXX</span>{" "}
            and can be redeemed once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dbConfigured ? (
            <RedeemForm initialCode={code ?? ""} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Gift redemption isn&apos;t available in this environment yet. Once a
              database is configured, your code will unlock Family here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SignInNudge() {
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Gift className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Sign in to redeem your gift
          </h1>
          <p className="mt-2 text-muted-foreground">
            Your gift unlocks Family for your account — sign in from the header,
            then come back to redeem your code.
          </p>
        </div>
      </div>
    </div>
  );
}
