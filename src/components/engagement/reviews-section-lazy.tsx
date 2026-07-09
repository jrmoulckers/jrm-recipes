"use client";

import dynamic from "next/dynamic";

import type { ReviewsSectionProps } from "./reviews-section";

// The reviews composer + list is a large client bundle that lives in the
// non-default "reviews" tab, so defer it to an on-demand chunk to keep the
// recipe route within its first-load JS budget (#206).
const ReviewsSectionImpl = dynamic(
  () => import("./reviews-section").then((mod) => mod.ReviewsSection),
  { ssr: false },
);

export function ReviewsSection(props: ReviewsSectionProps) {
  return <ReviewsSectionImpl {...props} />;
}
