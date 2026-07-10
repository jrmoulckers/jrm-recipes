"use client";

import * as React from "react";
import { Check, Loader2, Mail } from "lucide-react";

import { track } from "~/lib/analytics";
import { cn } from "~/lib/utils";
import { joinWaitlistAction } from "~/server/waitlist/actions";
import { type WaitlistSource } from "~/server/waitlist/validation";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

/**
 * Landing-page email/waitlist capture (issue #351). A single accessible email
 * field with inline validation and success/error states — the lighter-weight
 * conversion step for cold visitors who aren't ready to sign up. On success it
 * emits `waitlist_joined` client-side (browser distinct id, no PII) and shows a
 * friendly confirmation.
 */
export function WaitlistForm({
  source = "landing",
  className,
}: {
  source?: WaitlistSource;
  className?: string;
}) {
  const emailId = React.useId();
  const errorId = React.useId();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(() => {
      void joinWaitlistAction({ email, source }).then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDone(true);
        setEmail("");
        track("waitlist_joined", { source, duplicate: result.duplicate });
      });
    });
  }

  if (done) {
    return (
      <div
        role="status"
        className={cn(
          "flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium text-foreground",
          className,
        )}
      >
        <Check className="size-4 text-primary" aria-hidden />
        You&apos;re on the list — we&apos;ll be in touch with early access and
        cooking tips.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className={cn("w-full", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Label htmlFor={emailId} className="sr-only">
            Email address
          </Label>
          <Input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            disabled={isPending}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={isPending}
          className="shrink-0"
        >
          {isPending ? <Loader2 className="animate-spin" /> : <Mail />}
          {isPending ? "Joining…" : "Get early access"}
        </Button>
      </div>
      {error ? (
        <p id={errorId} className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
