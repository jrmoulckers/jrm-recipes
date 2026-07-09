import * as React from "react";
import { type Metadata } from "next";
import Link from "next/link";
import { ChefHat, Compass, Search, Users } from "lucide-react";

import { brand } from "~/config/brand";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { LogoMark } from "~/components/layout/logo";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Themed 404. Rendered for `notFound()` calls and any unmatched route. Kept as
 * a simple Server Component — it renders inside the root layout, so it inherits
 * the active theme without needing any client behaviour.
 */
export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_50%_0%,hsl(var(--primary)/0.12),transparent),radial-gradient(45%_50%_at_50%_100%,hsl(var(--accent)/0.10),transparent)]"
      />

      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <LogoMark className="size-14" />

        <p className="font-display text-6xl font-bold tracking-tight text-primary">
          404
        </p>

        <div className="flex flex-col gap-2">
          <h1 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            We couldn&rsquo;t find that page
          </h1>
          <p className="text-pretty text-muted-foreground">
            This recipe seems to have wandered off the counter. Let&rsquo;s get
            you back to the {brand.name} kitchen.
          </p>
        </div>

        {/* Recovery search: the fastest path back is usually to look the recipe
            up by name. Plain GET form so it works without client JS and keeps
            the themed, no-flash Server Component. */}
        <form action="/recipes" method="get" role="search" className="w-full">
          <Label htmlFor="not-found-search" className="sr-only">
            Search recipes
          </Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="not-found-search"
                type="search"
                name="q"
                placeholder="Search for a recipe by name…"
                autoComplete="off"
                className="ps-10"
              />
            </div>
            <Button type="submit">Search</Button>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/">
              <ChefHat /> Home
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/recipes">
              <Compass /> Browse recipes
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link href="/groups">
              <Users /> Family
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
