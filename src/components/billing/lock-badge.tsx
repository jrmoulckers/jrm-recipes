import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";

import { cn } from "~/lib/utils";
import { Badge, type BadgeProps } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

/**
 * Presentational paywall building blocks (issue #311).
 *
 * These are intentionally free of urgency/scarcity: no countdowns, no "only N
 * left", no interstitials. A {@link LockBadge} merely *labels* a premium
 * surface, and {@link LockedFeatureCard} offers one calm, dismissible route to
 * the pricing page. Neither ever hides or removes content a user already
 * created — gating applies only to premium features that were never free.
 *
 * Both are pure (no hooks, no client-only APIs) so they render on the server and
 * compose into either server or client trees.
 */

/** A small "Family" lock chip for premium surfaces. Purely a label. */
export function LockBadge({
  label = "Family",
  className,
  variant = "muted",
  ...props
}: BadgeProps & { label?: string }) {
  return (
    <Badge variant={variant} className={cn("gap-1", className)} {...props}>
      <Lock className="size-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}

/**
 * A calm locked-state card: names the feature, marks it as a Family perk, and
 * offers a single non-blocking CTA to `/pricing`. The default copy reassures the
 * reader that anything they already saved stays free.
 */
export function LockedFeatureCard({
  title = "A Family feature",
  description = "Upgrade to Family to unlock this. Everything you've already saved stays free — nothing you made is ever taken away.",
  cta = "See plans",
  href = "/pricing",
  className,
}: {
  title?: string;
  description?: string;
  cta?: string;
  href?: Route;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{title}</CardTitle>
          <LockBadge />
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href={href}>{cta}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
