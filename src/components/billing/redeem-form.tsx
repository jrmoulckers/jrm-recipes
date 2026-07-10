"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gift, PartyPopper } from "lucide-react";

import { redeemGiftAction } from "~/server/billing/actions";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

/**
 * Client form for redeeming a gift code (issue #331). Calls `redeemGiftAction`,
 * then shows a warm confirmation on success (and refreshes so the freshly
 * granted Family entitlement lights up around the app) or the action's friendly
 * message on any error. No code validation logic lives here — the server owns
 * the single-use claim; this is purely the entry + feedback surface.
 */
export function RedeemForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = React.useState(initialCode);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<{ months: number } | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(() => {
      void redeemGiftAction(code).then((result) => {
        if (result.ok) {
          setSuccess({ months: result.durationMonths });
          setCode("");
          router.refresh();
          return;
        }
        setSuccess(null);
        setError(result.error);
      });
    });
  }

  if (success) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-4 rounded-xl border border-success/40 bg-success/10 px-6 py-8 text-center"
      >
        <PartyPopper className="size-8 text-success" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-display text-xl font-semibold">
            Your gift is unwrapped!
          </p>
          <p className="text-sm text-muted-foreground">
            You now have {success.months} months of Heirloom Family. Every
            recipe, every relative — it&apos;s all unlocked.
          </p>
        </div>
        <Button asChild>
          <Link href="/recipes">Start cooking</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="gift-code">Gift code</Label>
        <Input
          id="gift-code"
          name="gift-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="GIFT-XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "gift-code-error" : undefined}
          className="font-mono tracking-wide"
        />
        {error ? (
          <p
            id="gift-code-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" loading={pending} disabled={!code.trim()}>
        <Gift className="size-4" aria-hidden="true" />
        Redeem gift
      </Button>
    </form>
  );
}
