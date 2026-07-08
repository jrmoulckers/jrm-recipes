"use client";

import * as React from "react";

import { cn } from "~/lib/utils";
import { createGiftCheckoutSessionAction } from "~/server/billing/actions";
import { Button, type ButtonProps } from "~/components/ui/button";

/**
 * Client entry point for buying a gift (issue #331). Mirrors `CheckoutButton`:
 * kicks off the one-time gift Checkout action and, on success, sends the buyer
 * to the Stripe-hosted URL; on failure it shows the action's own friendly note
 * inline so an unconfigured environment degrades to a readable message rather
 * than a dead end.
 */
export function GiftButton({ children, className, ...props }: ButtonProps) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function startGiftCheckout() {
    setError(null);
    startTransition(() => {
      void createGiftCheckoutSessionAction().then((result) => {
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
        onClick={startGiftCheckout}
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
