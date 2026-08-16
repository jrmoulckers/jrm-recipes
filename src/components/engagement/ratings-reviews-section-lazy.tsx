'use client';

import dynamic from 'next/dynamic';

import type { RatingsReviewsSectionProps } from './ratings-reviews-section';

// The composer + review list is a large client bundle that lives in the
// non-default "discussion" tab, so defer it to an on-demand chunk to keep the
// recipe route within its first-load JS budget (#206).
const RatingsReviewsSectionImpl = dynamic(
  () => import('./ratings-reviews-section').then((mod) => mod.RatingsReviewsSection),
  { ssr: false },
);

export function RatingsReviewsSection(props: RatingsReviewsSectionProps) {
  return <RatingsReviewsSectionImpl {...props} />;
}
