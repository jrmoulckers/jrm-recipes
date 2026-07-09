"use client";

import dynamic from "next/dynamic";

import type { CommentsSectionProps } from "./comments-section";

// The threaded comments UI is the largest client bundle on the recipe page and
// lives in the non-default "discussion" tab, so defer it to an on-demand chunk
// to keep the route within its first-load JS budget (#206).
const CommentsSectionImpl = dynamic(
  () => import("./comments-section").then((mod) => mod.CommentsSection),
  { ssr: false },
);

export function CommentsSection(props: CommentsSectionProps) {
  return <CommentsSectionImpl {...props} />;
}
