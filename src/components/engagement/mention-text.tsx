"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";

import { splitMentions, type MentionCandidate } from "~/lib/mentions";

/**
 * Render comment/review text with resolved @mentions as links to the member's
 * cook profile (issue #340). Unknown handles fall through as plain text.
 */
export function MentionText({
  body,
  candidates,
  className,
}: {
  body: string;
  candidates: MentionCandidate[];
  className?: string;
}) {
  const segments = React.useMemo(
    () => splitMentions(body, candidates),
    [body, candidates],
  );

  return (
    <span className={className}>
      {segments.map((segment, i) => {
        if (segment.type === "text") {
          return <React.Fragment key={i}>{segment.text}</React.Fragment>;
        }
        const label = segment.user.name ?? segment.user.handle ?? segment.handle;
        return segment.user.handle ? (
          <Link
            key={i}
            href={`/cooks/${segment.user.handle}` as Route}
            className="font-medium text-primary hover:underline"
          >
            @{label}
          </Link>
        ) : (
          <span key={i} className="font-medium text-primary">
            @{label}
          </span>
        );
      })}
    </span>
  );
}
