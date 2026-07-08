"use client";

import * as React from "react";

import { cn } from "~/lib/utils";
import { createBillingPortalSessionAction } from "~/server/billing/actions";
import { Button, type ButtonProps } from "~/components/ui/button";

/**
 * "Manage billing" entry point into the Stripe Customer Portal (issue #319).
 *
 * Mirrors {@link CheckoutButton}: it invokes the `createBillingPortalSessionAction`
 * server action and, on success, sends the browser to Stripe's hosted portal
 * where the family can update payment, view invoices, or cancel. On failure it
 * shows the action's own friendly message inline (e.g. "billing isn't set up
 * yet", or "you don't have a billing account yet") rather than throwing, so an
 * unconfigured environment degrades to a readable note instead of a dead end.
 */
export function ManageBillingButton({
  children,
  className,
  ...props
}: ButtonProps) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function openPortal() {
    setError(null);
    startTransition(() => {
      void createBillingPortalSessionAction().then((result) => {
        if (result.ok) {
          window.location.assign(result.url);
          return;
        }
        setError(result.error);
      });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={openPortal}
        loading={pending}
        className={cn(className)}
        {...props}
      >
        {children ?? "Manage billing"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
