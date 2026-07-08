import * as React from "react";

import { type FeatureFlagKey } from "~/config/plans";
import { hasEntitlement } from "~/server/billing/entitlements";
import { type User } from "~/server/db/schema";
import { LockedFeatureCard } from "./lock-badge";

/**
 * Server-side premium gate (issue #311).
 *
 * Renders `children` when `user` is entitled to `feature`; otherwise renders a
 * calm {@link LockedFeatureCard} (or a caller-supplied `fallback`). Resolution
 * runs through the entitlements resolver, which always degrades to Free, so a
 * signed-out user (or an unconfigured DB) simply sees the locked state.
 *
 * This is deliberately *not* a content blocker: use it to gate premium features
 * that were never free, never to hide a user's own saved recipes. The fallback
 * is a single, dismissible upgrade route with no urgency or scarcity language.
 */
export async function PremiumGate({
  user,
  feature,
  title,
  description,
  children,
  fallback,
}: {
  user: User | null;
  feature: FeatureFlagKey;
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** Custom locked-state UI; defaults to {@link LockedFeatureCard}. */
  fallback?: React.ReactNode;
}) {
  const entitled = user ? await hasEntitlement(user, feature) : false;
  if (entitled) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  return <LockedFeatureCard title={title} description={description} />;
}
