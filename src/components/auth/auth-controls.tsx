"use client";

import * as React from "react";
import Link from "next/link";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

import { Button } from "~/components/ui/button";
import { track } from "~/lib/analytics";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";

type SafeUser = {
  name: string | null;
  avatarUrl: string | null;
};

/**
 * Header auth controls. Renders Clerk's UI when configured, otherwise shows a
 * friendly "local mode" pill so the app is fully usable with no accounts.
 */
export function AuthControls({
  isConfigured,
  user,
}: {
  isConfigured: boolean;
  user: SafeUser | null;
}) {
  if (!isConfigured) {
    const initials =
      user?.name
        ?.split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() ?? "HC";
    return (
      <div className="flex items-center gap-2">
        <Badge variant="muted" className="hidden sm:inline-flex">
          Local mode
        </Badge>
        <Avatar className="size-9">
          {user?.avatarUrl ? (
            <AvatarImage src={user.avatarUrl} alt={user.name ?? "You"} />
          ) : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </div>
    );
  }

  return (
    <>
      <SignedOut>
        <div className="flex items-center gap-2">
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm" onClick={() => track("signup_started", {})}>
              Get started
            </Button>
          </SignUpButton>
        </div>
      </SignedOut>
      <SignedIn>
        <UserButton appearance={{ elements: { avatarBox: "h-9 w-9" } }} />
      </SignedIn>
    </>
  );
}

/** A primary CTA that routes to create-recipe (used on landing / empty states). */
export function StartCookingButton({
  isConfigured,
  className,
}: {
  isConfigured: boolean;
  className?: string;
}) {
  if (isConfigured) {
    return (
      <SignedOut>
        <SignUpButton mode="modal">
          <Button
            size="lg"
            className={className}
            onClick={() => track("signup_started", {})}
          >
            Start your cookbook
          </Button>
        </SignUpButton>
      </SignedOut>
    );
  }
  return (
    <Button size="lg" className={className} asChild>
      <Link href="/recipes/new">Start your cookbook</Link>
    </Button>
  );
}
