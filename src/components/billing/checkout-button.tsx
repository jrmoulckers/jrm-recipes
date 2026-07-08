"use client";

import * as React from "react";

import { cn } from "~/lib/utils";
import { createCheckoutSessionAction } from "~/server/billing/actions";
import { Button, type ButtonProps } from "~/components/ui/button";

/**
 * The single client entry point into Stripe Checkout (issues #311 / #312).
 *
 * Invokes the `createCheckoutSessionAction` server action for a plan and, on
 * success, sends the browser to the returned Stripe-hosted URL. On failure it
 * shows the action's own friendly message inline (e.g. "billing isn't set up
 * yet") instead of throwing, so an unconfigured environment degrades to a
 * readable note rather than a dead end. No prices are hard-coded here — amounts
 * live in Stripe, plan copy in `src/config/plans.ts`.
 */
export function CheckoutButton({
  planId,
  children,
  className,
  ...props
}: ButtonProps & { planId: string }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function startCheckout() {
    setError(null);
    startTransition(() => {
      void createCheckoutSessionAction(planId).then((result) => {
        if (result.ok) {
          window.location.assign(result.url);
          return;
        }
        setError(result.error);
      });
    });
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <Button
        type="button"
        onClick={startCheckout}
        loading={pending}
        className={cn("w-full", className)}
        {...props}
      >
        {children}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
