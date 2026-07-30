"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";

import type { ActivityEvent } from "~/server/activity/queries";
import type { ActivityFeedSource } from "./activity-feed";

// The personal home feed sits below the fold on the signed-in home route, which
// is first-load-JS budgeted (#206). Defer the feed's client bundle (server
// actions, icons, and load-more state) to an on-demand chunk so it stays out of
// the home route's first-load JS. It's a progressive enhancement — the server
// already fetched the initial page of events and passes them in as props.
const ActivityFeedImpl = dynamic(
  () => import("./activity-feed").then((mod) => mod.ActivityFeed),
  { ssr: false },
);

export function ActivityFeedLazy(props: {
  source: ActivityFeedSource;
  initialEvents: ActivityEvent[];
  initialCursor: string | null;
  emptyState?: ReactNode;
}) {
  return <ActivityFeedImpl {...props} />;
}
