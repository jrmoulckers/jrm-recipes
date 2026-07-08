import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookHeart, ChefHat, CloudOff, Timer } from "lucide-react";

import { brand } from "~/config/brand";
import { Button } from "~/components/ui/button";
import { LogoMark } from "~/components/layout/logo";
import { OfflineReconnect } from "~/components/pwa/offline-reconnect";

export const metadata: Metadata = {
  title: "You're offline",
  description: `${brand.name} works offline — reconnect to sync the latest.`,
};

const stillWorks = [
  {
    icon: Timer,
    title: "Cook mode",
    body: "Any recipe you've opened stays hands-free with timers and scaling.",
  },
  {
    icon: BookHeart,
    title: "Recipes you've viewed",
    body: "Recently opened recipes are cached and ready to read.",
  },
];

export default function OfflinePage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_50%_0%,hsl(var(--primary)/0.12),transparent),radial-gradient(45%_50%_at_50%_100%,hsl(var(--accent)/0.10),transparent)]"
      />

      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div className="relative">
          <LogoMark className="size-14" />
          <span className="absolute -bottom-1 -end-1 inline-flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
            <CloudOff className="size-4" />
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            You&rsquo;re offline
          </h1>
          <p className="text-pretty text-muted-foreground">
            No internet right now — but the kitchen never closes. Reconnect to
            browse, save and sync your family&rsquo;s recipes again.
          </p>
        </div>

        <OfflineReconnect />

        <div className="mt-4 w-full rounded-2xl border border-border bg-surface/60 p-4 text-start">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Still works without a connection
          </p>
          <ul className="flex flex-col gap-3">
            {stillWorks.map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <item.icon className="size-5" />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {item.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ChefHat className="size-4" />
            Go to {brand.name} home
          </Link>
        </Button>
      </div>
    </main>
  );
}
