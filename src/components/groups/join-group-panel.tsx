"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { LogIn, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { acceptInviteLinkAction } from "~/server/groups/actions";
import { track } from "~/lib/analytics";
import { Button } from "~/components/ui/button";

/**
 * The interactive half of the `/join/[token]` page (issue #343).
 *
 * Signed in: a "Join" CTA that calls {@link acceptInviteLinkAction} and routes
 * into the group. If the visitor arrived with `?auto=1` (set on the post-auth
 * redirect) it fires that join automatically — so opening a link while signed
 * out flows through sign-up/in and then lands straight in the group. Signed
 * out: Clerk sign-up / sign-in buttons whose redirect returns here with the
 * auto-join flag.
 */
export function JoinGroupPanel({
  token,
  groupName,
  signedIn,
  authConfigured,
}: {
  token: string;
  groupName: string;
  signedIn: boolean;
  authConfigured: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldAutoJoin = searchParams.get("auto") === "1";
  const [isPending, startTransition] = React.useTransition();
  const autoJoined = React.useRef(false);

  const join = React.useCallback(() => {
    startTransition(() => {
      void acceptInviteLinkAction(token).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(
          result.alreadyMember
            ? `You're already in ${groupName}`
            : `Welcome to ${groupName}!`,
        );
        router.push(`/groups/${result.slug}`);
      });
    });
  }, [token, groupName, router]);

  // Auto-join once when returning from auth with the intent flag set.
  React.useEffect(() => {
    if (signedIn && shouldAutoJoin && !autoJoined.current) {
      autoJoined.current = true;
      join();
    }
  }, [signedIn, shouldAutoJoin, join]);

  if (signedIn) {
    return (
      <Button size="lg" className="w-full" onClick={join} disabled={isPending}>
        <Users />
        {isPending ? "Joining…" : `Join ${groupName}`}
      </Button>
    );
  }

  // Signed out. When auth is configured, route through Clerk and come back with
  // the auto-join flag so the visitor lands in the group without a second click.
  const returnTo = `/join/${token}?auto=1`;

  if (!authConfigured) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Sign in to accept this invitation.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <SignUpButton mode="modal" forceRedirectUrl={returnTo}>
        <Button
          size="lg"
          className="w-full"
          onClick={() => track("signup_started", {})}
        >
          <UserPlus />
          Sign up &amp; join
        </Button>
      </SignUpButton>
      <SignInButton mode="modal" forceRedirectUrl={returnTo}>
        <Button size="lg" variant="outline" className="w-full">
          <LogIn />I already have an account
        </Button>
      </SignInButton>
    </div>
  );
}
