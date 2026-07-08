import { type GroupSizeBucket } from "./events";

/**
 * Bucket a group's member count into a coarse cohort for analytics.
 *
 * We deliberately never send the raw member count: a bucket is enough to study
 * how group size correlates with invites and retention, while a small family
 * (say, exactly 2 people) can't be singled out or re-identified from an exact
 * headcount. Counts of 0 or 1 collapse to the "1" bucket.
 */
export function groupSizeBucket(memberCount: number): GroupSizeBucket {
  if (memberCount <= 1) return "1";
  if (memberCount <= 5) return "2-5";
  if (memberCount <= 10) return "6-10";
  return "11+";
}
